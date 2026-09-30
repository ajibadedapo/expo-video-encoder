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
        } catch let failure as EncodeFailure {
          promise.reject(failure.code, failure.message)
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

  struct EncodeFailure: Error {
    let code: String
    let message: String

    static func writer(_ step: String, _ writer: AVAssetWriter?) -> EncodeFailure {
      let reason = writer?.error?.localizedDescription ?? "no reason given by AVAssetWriter"
      return EncodeFailure(code: "WRITER_FAILED", message: "\(step): \(reason)")
    }
  }

  static let presentationTimescale: CMTimeScale = 90_000

  static func presentationTime(frameIndex: Int, fps: Double) -> CMTime {
    CMTime(seconds: Double(frameIndex) / fps, preferredTimescale: presentationTimescale)
  }

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
    try FileManager.default.createDirectory(
      at: outputURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )

    let writer: AVAssetWriter
    do {
      writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    } catch {
      throw EncodeFailure(code: "WRITER_FAILED", message: "Could not create AVAssetWriter: \(error.localizedDescription)")
    }

    let bitrate = Int(Double(width * height) * fps / 8)
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

    guard writer.canAdd(input) else {
      throw EncodeFailure(code: "WRITER_FAILED", message: "AVAssetWriter rejected H.264 output at \(width)x\(height)")
    }
    writer.add(input)

    guard writer.startWriting() else {
      throw EncodeFailure.writer("Could not start writing", writer)
    }
    writer.startSession(atSourceTime: .zero)

    var appendedFrames = 0

    for i in 0..<frameCount {
      let frameName = String(format: "frame_%06d.jpg", i)
      let framePath = (framesDir as NSString).appendingPathComponent(frameName)

      guard
        let image  = UIImage(contentsOfFile: framePath),
        let buffer = pixelBuffer(from: image, width: width, height: height)
      else { continue }

      while !input.isReadyForMoreMediaData {
        if writer.status != .writing {
          let failure = EncodeFailure.writer("Writer stopped before frame \(i)", writer)
          writer.cancelWriting()
          throw failure
        }
        Thread.sleep(forTimeInterval: 0.005)
      }

      if adaptor.append(buffer, withPresentationTime: presentationTime(frameIndex: i, fps: fps)) {
        appendedFrames += 1
      } else {
        let failure = EncodeFailure.writer("Could not append frame \(i)", writer)
        writer.cancelWriting()
        throw failure
      }
    }

    guard appendedFrames > 0 else {
      writer.cancelWriting()
      try? FileManager.default.removeItem(at: outputURL)
      throw EncodeFailure(
        code: "NO_READABLE_FRAMES",
        message: "None of the \(frameCount) frame files in \(framesDir) could be read as JPEG"
      )
    }

    input.markAsFinished()

    let sema = DispatchSemaphore(value: 0)
    writer.finishWriting { sema.signal() }
    sema.wait()

    guard writer.status == .completed else {
      throw EncodeFailure.writer("Could not finish the MP4", writer)
    }
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

    var audioMixParams: [AVMutableAudioMixInputParameters] = []

    for trackInfo in audioTracks {
      guard
        let uri        = trackInfo["uri"]        as? String,
        let startMs    = trackInfo["startMs"]    as? Double,
        let durationMs = trackInfo["durationMs"] as? Double
      else { continue }

      let volume     = (trackInfo["volume"] as? Double) ?? 1.0
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

      let params = AVMutableAudioMixInputParameters(track: compAudio)
      params.setVolume(Float(min(max(volume, 0), 1)), at: .zero)
      audioMixParams.append(params)
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

    if !audioMixParams.isEmpty {
      let audioMix = AVMutableAudioMix()
      audioMix.inputParameters = audioMixParams
      session.audioMix = audioMix
    }

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
