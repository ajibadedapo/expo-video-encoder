package expo.modules.videoencoder

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.Image
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class NoReadableFramesException(message: String) : Exception(message)

class MuxerFailureException(message: String, cause: Throwable?) : Exception(message, cause)

internal fun presentationTimeUs(frameIndex: Int, fps: Double): Long =
  Math.round(frameIndex * 1_000_000.0 / fps)

internal fun bitRateFor(width: Int, height: Int, fps: Double): Int =
  (width.toDouble() * height * fps / 8).coerceIn(1.0, Int.MAX_VALUE.toDouble()).toInt()

internal inline fun <T> muxerStep(step: String, block: () -> T): T =
  try {
    block()
  } catch (error: Exception) {
    throw MuxerFailureException("$step: ${error.message ?: error.javaClass.simpleName}", error)
  }

class VideoEncoderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VideoEncoder")

    AsyncFunction("encodeVideo") { options: Map<String, Any?>, promise: Promise ->
      val framesDir = options["framesDir"] as? String
      val frameCount = (options["frameCount"] as? Number)?.toInt()
      val fps = (options["fps"] as? Number)?.toDouble()
      val width = (options["width"] as? Number)?.toInt()
      val height = (options["height"] as? Number)?.toInt()
      val outputPath = options["outputPath"] as? String

      if (framesDir == null || frameCount == null || fps == null || width == null || height == null || outputPath == null) {
        promise.reject("INVALID_ARGS", "encodeVideo: missing required options", null)
        return@AsyncFunction
      }

      try {
        encodeFrames(framesDir, frameCount, fps, width, height, outputPath)
        promise.resolve(true)
      } catch (error: NoReadableFramesException) {
        promise.reject("NO_READABLE_FRAMES", error.message ?: "No readable frame files were found", error)
      } catch (error: MuxerFailureException) {
        promise.reject("WRITER_FAILED", error.message ?: "MediaMuxer failed", error)
      } catch (error: Exception) {
        promise.reject("ENCODE_ERROR", error.message ?: "Encode failed", error)
      }
    }

    AsyncFunction("mixAudio") { _: Map<String, Any?>, promise: Promise ->
      promise.reject(
        "MIX_UNSUPPORTED",
        "mixAudio is not yet implemented on Android. Fall back to the silent video produced by encodeVideo.",
        null
      )
    }
  }

  private fun encodeFrames(
    framesDir: String,
    frameCount: Int,
    fps: Double,
    width: Int,
    height: Int,
    outputPath: String
  ) {
    val outFile = File(outputPath)
    if (outFile.exists() && !outFile.delete()) {
      throw IllegalStateException("Could not replace the existing file at $outputPath")
    }
    outFile.parentFile?.mkdirs()

    var finished = false
    try {
      writeFrames(framesDir, frameCount, fps, width, height, outputPath)
      finished = true
    } finally {
      if (!finished) outFile.delete()
    }
  }

  private fun writeFrames(
    framesDir: String,
    frameCount: Int,
    fps: Double,
    width: Int,
    height: Int,
    outputPath: String
  ) {
    val mime = MediaFormat.MIMETYPE_VIDEO_AVC
    val format = MediaFormat.createVideoFormat(mime, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
      setInteger(MediaFormat.KEY_BIT_RATE, bitRateFor(width, height, fps))
      setInteger(MediaFormat.KEY_FRAME_RATE, Math.round(fps).toInt().coerceAtLeast(1))
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }

    val muxer = muxerStep("Could not create the MP4 muxer") {
      MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    }
    val codec = try {
      MediaCodec.createEncoderByType(mime)
    } catch (error: Exception) {
      muxer.release()
      throw error
    }

    var codecStarted = false
    var trackIndex = -1
    var muxerStarted = false
    var samplesWritten = 0
    val bufferInfo = MediaCodec.BufferInfo()
    var appended = 0
    var lastFrameIndex = -1

    fun drain(endOfStream: Boolean) {
      while (true) {
        val outIndex = codec.dequeueOutputBuffer(bufferInfo, 10_000)
        when {
          outIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
            if (!endOfStream) return
          }
          outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            if (muxerStarted) throw IllegalStateException("Output format changed more than once")
            val outputFormat = codec.outputFormat
            trackIndex = muxerStep("Could not add the H.264 track to the MP4") { muxer.addTrack(outputFormat) }
            muxerStep("Could not start the MP4 muxer") { muxer.start() }
            muxerStarted = true
          }
          outIndex >= 0 -> {
            val encoded = codec.getOutputBuffer(outIndex)
              ?: throw IllegalStateException("Encoder returned a null output buffer")
            if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
              bufferInfo.size = 0
            }
            if (bufferInfo.size > 0) {
              if (!muxerStarted) throw IllegalStateException("Muxer was not started before sample data")
              encoded.position(bufferInfo.offset)
              encoded.limit(bufferInfo.offset + bufferInfo.size)
              muxerStep("Could not write an encoded frame to the MP4") {
                muxer.writeSampleData(trackIndex, encoded, bufferInfo)
              }
              samplesWritten += 1
            }
            codec.releaseOutputBuffer(outIndex, false)
            if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
          }
        }
      }
    }

    fun nextInputBuffer(): Int {
      var inIndex = codec.dequeueInputBuffer(10_000)
      while (inIndex < 0) {
        drain(false)
        inIndex = codec.dequeueInputBuffer(10_000)
      }
      return inIndex
    }

    try {
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      codec.start()
      codecStarted = true

      for (i in 0 until frameCount) {
        val framePath = File(framesDir, String.format("frame_%06d.jpg", i))
        if (!framePath.exists()) continue
        val decoded = BitmapFactory.decodeFile(framePath.absolutePath) ?: continue
        val bitmap = if (decoded.width != width || decoded.height != height) {
          Bitmap.createScaledBitmap(decoded, width, height, true)
        } else {
          decoded
        }

        val inIndex = nextInputBuffer()
        val image = codec.getInputImage(inIndex)
          ?: throw IllegalStateException("Encoder returned a null input image")
        fillImageFromBitmap(image, bitmap, width, height)

        codec.queueInputBuffer(inIndex, 0, width * height * 3 / 2, presentationTimeUs(i, fps), 0)

        if (bitmap !== decoded) bitmap.recycle()
        decoded.recycle()

        appended += 1
        lastFrameIndex = i
        drain(false)
      }

      if (appended == 0) throw NoReadableFramesException("None of the $frameCount frame files in $framesDir could be read as JPEG")

      val eosIndex = nextInputBuffer()
      codec.queueInputBuffer(eosIndex, 0, 0, presentationTimeUs(lastFrameIndex + 1, fps), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      drain(true)

      if (!muxerStarted || samplesWritten == 0) {
        throw MuxerFailureException("The encoder produced no frames for the MP4", null)
      }
      muxerStarted = false
      muxerStep("Could not finish the MP4") { muxer.stop() }
    } finally {
      if (codecStarted) runCatching { codec.stop() }
      codec.release()
      if (muxerStarted) runCatching { muxer.stop() }
      muxer.release()
    }
  }

  private fun fillImageFromBitmap(image: Image, bitmap: Bitmap, width: Int, height: Int) {
    val argb = IntArray(width * height)
    bitmap.getPixels(argb, 0, width, 0, 0, width, height)

    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]
    val yBuffer = yPlane.buffer
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer
    val yRowStride = yPlane.rowStride
    val yPixelStride = yPlane.pixelStride
    val uRowStride = uPlane.rowStride
    val uPixelStride = uPlane.pixelStride
    val vRowStride = vPlane.rowStride
    val vPixelStride = vPlane.pixelStride

    for (row in 0 until height) {
      for (col in 0 until width) {
        val color = argb[row * width + col]
        val r = (color shr 16) and 0xFF
        val g = (color shr 8) and 0xFF
        val b = color and 0xFF

        val y = (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).coerceIn(0, 255)
        yBuffer.put(row * yRowStride + col * yPixelStride, y.toByte())

        if (row % 2 == 0 && col % 2 == 0) {
          val u = (((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128).coerceIn(0, 255)
          val v = (((112 * r - 94 * g - 18 * b + 128) shr 8) + 128).coerceIn(0, 255)
          val uvRow = row / 2
          val uvCol = col / 2
          uBuffer.put(uvRow * uRowStride + uvCol * uPixelStride, u.toByte())
          vBuffer.put(uvRow * vRowStride + uvCol * vPixelStride, v.toByte())
        }
      }
    }
  }
}
