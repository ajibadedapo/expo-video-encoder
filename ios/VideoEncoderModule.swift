import ExpoModulesCore
import AVFoundation
import UIKit
import CoreVideo

public class VideoEncoderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoEncoder")

    AsyncFunction("encodeVideo") { (options: [String: Any], promise: Promise) in
      guard
        let framesDir  = options["framesDir"]  as? String,
        let frameCount = options["frameCount"] as? Int,
        let fps        = options["fps"]        as? Double,
        let width      = options["width"]      as? Int,
        let height     = options["height"]     as? Int,
        let outputPath = options["outputPath"] as? String
      else {
        promise.reject("INVALID_ARGS", "encodeVideo: missing required options")
        return
      }

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VideoEncoderModule.encodeFrames(
            framesDir:  framesDir,
            frameCount: frameCount,
            fps:        fps,
            width:      width,
            height:     height,
            outputPath: outputPath
          )
          promise.resolve(true)
        } catch {
          promise.reject("ENCODE_ERROR", error.localizedDescription)
        }
      }
    }

    AsyncFunction("mixAudio") { (options: [String: Any], promise: Promise) in
      guard
        let videoPath       = options["videoPath"]       as? String,
        let audioTracks     = options["audioTracks"]     as? [[String: Any]],
        let outputPath      = options["outputPath"]      as? String,
        let totalDurationMs = options["totalDurationMs"] as? Double
      else {
        promise.reject("INVALID_ARGS", "mixAudio: missing required options")
        return
      }

      VideoEncoderModule.mixAudioTracks(
        videoPath:       videoPath,
        audioTracks:     audioTracks,
        outputPath:      outputPath,
        totalDurationMs: totalDurationMs
      ) { success, error in
        if success {
          promise.resolve(true)
        } else {
          promise.reject("MIX_ERROR", error ?? "Audio mix failed")
        }
      }
    }
  }

  // MARK: - Frame encoding

  private static func encodeFrames(
    framesDir:  String,
    frameCount: Int,
    fps:        Double,
    width:      Int,
    height:     Int,
    outputPath: String
  ) throws {
    let outputURL = URL(fileURLWithPath: outputPath)

    if FileManager.default.fileExists(atPath: outputPath) {
      try FileManager.default.removeItem(at: outputURL)
    }

    guard let writer = try? AVAssetWriter(outputURL: outputURL, fileType: .mp4) else {
      throw NSError(domain: "VideoEncoder", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Failed to create AVAssetWriter"
      ])
    }

    let bitrate = width * height * Int(fps) / 8
    let videoSettings: [String: Any] = [
      AVVideoCodecKey:  AVVideoCodecType.h264,
      AVVideoWidthKey:  width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitrate,
        AVVideoProfileLevelKey:   AVVideoProfileLevelH264HighAutoLevel,
      ],
    ]

    let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    input.expectsMediaDataInRealTime = false

    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey           as String: width,
        kCVPixelBufferHeightKey          as String: height,
      ]
    )

    writer.add(input)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    let frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps))

    for i in 0..<frameCount {
      let frameName = String(format: "frame_%06d.jpg", i)
      let framePath = (framesDir as NSString).appendingPathComponent(frameName)

      guard
        let image  = UIImage(contentsOfFile: framePath),
        let buffer = pixelBuffer(from: image, width: width, height: height)
      else { continue }

      while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }

      let pts = CMTimeMultiply(frameDuration, multiplier: Int32(i))
      adaptor.append(buffer, withPresentationTime: pts)
    }

    input.markAsFinished()

    let sema = DispatchSemaphore(value: 0)
    var writeError: Error?
    writer.finishWriting {
      writeError = writer.error
      sema.signal()
    }
    sema.wait()

    if let err = writeError { throw err }
  }

  // MARK: - Audio mixing

  private static func mixAudioTracks(
    videoPath:       String,
    audioTracks:     [[String: Any]],
    outputPath:      String,
    totalDurationMs: Double,
    completion:      @escaping (Bool, String?) -> Void
  ) {
    let composition   = AVMutableComposition()
    let videoAsset    = AVURLAsset(url: URL(fileURLWithPath: videoPath))
    let totalDuration = CMTime(value: CMTimeValue(totalDurationMs), timescale: 1000)

    guard
      let compVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let srcVideo  = videoAsset.tracks(withMediaType: .video).first
    else {
      completion(false, "No video track in source file")
      return
    }

    do {
      try compVideo.insertTimeRange(
        CMTimeRange(start: .zero, duration: videoAsset.duration),
        of: srcVideo,
        at: .zero
      )
    } catch {
      completion(false, error.localizedDescription)
      return
    }

    for trackInfo in audioTracks {
      guard
        let uri        = trackInfo["uri"]        as? String,
        let startMs    = trackInfo["startMs"]    as? Double,
        let durationMs = trackInfo["durationMs"] as? Double
      else { continue }

      let audioURL   = URL(string: uri) ?? URL(fileURLWithPath: uri)
      let audioAsset = AVURLAsset(url: audioURL)
      let startTime  = CMTime(value: CMTimeValue(startMs), timescale: 1000)
      let clipDur    = CMTime(value: CMTimeValue(durationMs), timescale: 1000)

      guard
        let srcAudio  = audioAsset.tracks(withMediaType: .audio).first,
        let compAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
      else { continue }

      try? compAudio.insertTimeRange(
        CMTimeRange(start: .zero, duration: clipDur),
        of: srcAudio,
        at: startTime
      )
    }

    let outputURL = URL(fileURLWithPath: outputPath)
    try? FileManager.default.removeItem(at: outputURL)

    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      completion(false, "Could not create AVAssetExportSession")
      return
    }

    session.outputURL      = outputURL
    session.outputFileType = .mp4
    session.timeRange      = CMTimeRange(start: .zero, duration: totalDuration)

    session.exportAsynchronously {
      switch session.status {
      case .completed: completion(true, nil)
      case .failed:    completion(false, session.error?.localizedDescription ?? "Export failed")
      case .cancelled: completion(false, "Cancelled")
      default:         completion(false, "Unknown export error")
      }
    }
  }

  // MARK: - CVPixelBuffer

  private static func pixelBuffer(from image: UIImage, width: Int, height: Int) -> CVPixelBuffer? {
    var buffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(
      kCFAllocatorDefault, width, height,
      kCVPixelFormatType_32ARGB,
      [
        kCVPixelBufferCGImageCompatibilityKey:        true,
        kCVPixelBufferCGBitmapContextCompatibilityKey: true,
      ] as CFDictionary,
      &buffer
    )
    guard status == kCVReturnSuccess, let buf = buffer else { return nil }

    CVPixelBufferLockBaseAddress(buf, [])
    defer { CVPixelBufferUnlockBaseAddress(buf, []) }

    guard let ctx = CGContext(
      data:             CVPixelBufferGetBaseAddress(buf),
      width:            width,
      height:           height,
      bitsPerComponent: 8,
      bytesPerRow:      CVPixelBufferGetBytesPerRow(buf),
      space:            CGColorSpaceCreateDeviceRGB(),
      bitmapInfo:       CGImageAlphaInfo.noneSkipFirst.rawValue
    ), let cgImage = image.cgImage else { return nil }

    ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    return buf
  }
}
