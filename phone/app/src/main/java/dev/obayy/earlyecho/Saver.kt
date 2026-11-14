package dev.obayy.earlyecho

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.RandomAccessFile

object Saver {
    private const val FOLDER = "Early Echo"

    private fun open(context: Context, name: String, mime: String): java.io.OutputStream {
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mime)
            put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER")
        }
        val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("no room in Downloads")
        return context.contentResolver.openOutputStream(uri) ?: error("couldn't open $name")
    }

    fun text(context: Context, name: String, mime: String, body: String) {
        open(context, name, mime).use { it.write(body.toByteArray(Charsets.UTF_8)) }
    }

    fun sound(context: Context, name: String, file: SoundFile) {
        val f = file.finish()
        open(context, name, "audio/wav").use { out -> f.inputStream().use { it.copyTo(out) } }
        f.delete()
    }
}

class SoundFile(dir: File) {
    private val file = File.createTempFile("echo", ".wav", dir)
    private val out = RandomAccessFile(file, "rw")
    private var samples = 0L
    private val bytes = ByteArray(P * 2)

    init {
        out.write(ByteArray(44))
    }

    fun write(frame: FloatArray) {
        if (samples > 3600L * FS) return
        for (i in frame.indices) {
            val v = (frame[i].coerceIn(-1f, 1f) * 32767).toInt()
            bytes[2 * i] = v.toByte()
            bytes[2 * i + 1] = (v shr 8).toByte()
        }
        out.write(bytes, 0, frame.size * 2)
        samples += frame.size
    }

    fun finish(): File {
        val data = samples * 2
        out.seek(0)
        val h = java.nio.ByteBuffer.allocate(44).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        h.put("RIFF".toByteArray()).putInt((36 + data).toInt()).put("WAVE".toByteArray())
        h.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(FS).putInt(FS * 2).putShort(2).putShort(16)
        h.put("data".toByteArray()).putInt(data.toInt())
        out.write(h.array())
        out.close()
        return file
    }

    fun discard() {
        try { out.close() } catch (_: Exception) {}
        file.delete()
    }
}
