package dev.obayy.earlyecho

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTimestamp
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Process
import android.os.SystemClock
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max

class Frame(
    val t: Long,
    val own: Peak?,
    val other: Peak?,
    val steady: Boolean,
    val sound: FloatArray?,
)

class Audio(private val context: Context, private val own: Probe, private val other: Probe, private val onFrame: (Frame) -> Unit) {
    private val running = AtomicBoolean(false)
    private val pending = AtomicInteger(0)
    private val loseOwn = AtomicBoolean(false)
    private val loseOther = AtomicBoolean(false)
    @Volatile var keepSound = false
    @Volatile var error: String? = null
        private set
    private var threads = emptyList<Thread>()

    fun start() {
        if (!running.compareAndSet(false, true)) return
        threads = listOf(Thread(::play, "chirp"), Thread(::listen, "listen"))
        threads.forEach { it.start() }
    }

    fun stop() {
        running.set(false)
        threads.forEach { it.join(1500) }
        threads = emptyList()
    }

    fun delay(samples: Int) {
        pending.set(samples)
        loseOwn.set(true)
    }

    fun otherMoved() = loseOther.set(true)

    private fun play() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
        val min = AudioTrack.getMinBufferSize(FS, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
        val track = try {
            AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(FS).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(max(min, 4 * 4096))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
        } catch (e: Exception) {
            error = "The speaker could not be opened (${e.message})."
            return
        }
        val wave = own.wave
        val block = FloatArray(512)
        var at = 0
        track.play()
        while (running.get()) {
            val d = pending.getAndSet(0)
            if (d != 0) {
                val fade = FloatArray(FADE)
                for (i in 0 until FADE) {
                    val w = i.toFloat() / FADE
                    fade[i] = (1 - w) * wave[(at + i) % P] + w * wave[Math.floorMod(at - d + i, P)]
                }
                track.write(fade, 0, FADE, AudioTrack.WRITE_BLOCKING)
                at = Math.floorMod(at - d + FADE, P)
                continue
            }
            for (i in block.indices) {
                block[i] = wave[at]
                at = if (at == P - 1) 0 else at + 1
            }
            track.write(block, 0, block.size, AudioTrack.WRITE_BLOCKING)
        }
        track.stop()
        track.release()
    }

    @SuppressLint("MissingPermission")
    private fun listen() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
        val manager = context.getSystemService(AudioManager::class.java)
        val source = if (manager.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true") MediaRecorder.AudioSource.UNPROCESSED else MediaRecorder.AudioSource.VOICE_RECOGNITION
        val min = AudioRecord.getMinBufferSize(FS, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT)
        val rec = try {
            AudioRecord.Builder()
                .setAudioSource(source)
                .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(FS).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build())
                .setBufferSizeInBytes(max(min, P * 4 * 8))
                .build()
        } catch (e: Exception) {
            error = "The microphone could not be opened (${e.message})."
            return
        }
        if (rec.state != AudioRecord.STATE_INITIALIZED) {
            error = "The microphone could not be opened."
            rec.release()
            return
        }
        val matcher = Matcher(own, other)
        val ownTrack = Track(own)
        val otherTrack = Track(other)
        val frame = FloatArray(P)
        val stamp = AudioTimestamp()
        var read = 0L
        rec.startRecording()
        while (running.get()) {
            var got = 0
            while (got < P && running.get()) {
                val n = rec.read(frame, got, P - got, AudioRecord.READ_BLOCKING)
                if (n < 0) {
                    error = "The microphone stopped (error $n)."
                    running.set(false)
                    break
                }
                got += n
            }
            if (got < P) break
            val first = read
            read += P
            val t = if (rec.getTimestamp(stamp, AudioTimestamp.TIMEBASE_BOOTTIME) == AudioRecord.SUCCESS) {
                stamp.nanoTime + ((first + P / 2 - stamp.framePosition) * 1e9 / FS).toLong()
            } else {
                SystemClock.elapsedRealtimeNanos() - (P / 2 * 1e9 / FS).toLong()
            }
            if (loseOwn.getAndSet(false)) ownTrack.lose()
            if (loseOther.getAndSet(false)) otherTrack.lose()
            matcher.match(frame)
            val o = ownTrack.find(matcher.ownRe, matcher.ownIm, matcher.ownPower, matcher.ownFloor, matcher.ownRRe, matcher.ownRIm)
            val x = otherTrack.find(matcher.otherRe, matcher.otherIm, matcher.otherPower, matcher.otherFloor, matcher.otherRRe, matcher.otherRIm, avoid = o?.at)
            val steady = ownTrack.steady && otherTrack.steady && kotlin.math.abs(ownTrack.off) < 2 && kotlin.math.abs(otherTrack.off) < 2
            onFrame(Frame(t, o, x, steady, if (keepSound) frame.copyOf() else null))
        }
        rec.stop()
        rec.release()
    }

    companion object {
        const val FADE = 256
    }
}
