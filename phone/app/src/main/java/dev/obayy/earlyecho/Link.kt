package dev.obayy.earlyecho

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.util.concurrent.Executors

class Link(private val onMessage: (List<String>, InetAddress) -> Unit) {
    private var socket: DatagramSocket? = null
    private val out = Executors.newSingleThreadExecutor()
    @Volatile private var running = false
    private var thread: Thread? = null

    fun start() {
        if (running) return
        running = true
        try {
            socket = DatagramSocket(null).apply {
                reuseAddress = true
                broadcast = true
                bind(InetSocketAddress(PORT))
            }
        } catch (e: Exception) {
            running = false
            return
        }
        thread = Thread({
            val buf = ByteArray(4096)
            while (running) {
                val packet = DatagramPacket(buf, buf.size)
                try {
                    socket?.receive(packet) ?: break
                } catch (e: Exception) {
                    if (!running) break else continue
                }
                val text = String(packet.data, 0, packet.length, Charsets.UTF_8)
                val parts = text.split('|')
                if (parts.size < 2 || parts[0] != TAG) continue
                onMessage(parts.drop(1), packet.address)
            }
        }, "link").also { it.start() }
    }

    fun stop() {
        running = false
        socket?.close()
        socket = null
        thread?.join(500)
    }

    fun send(to: InetAddress, vararg parts: Any) {
        val bytes = (listOf(TAG) + parts.map { it.toString() }).joinToString("|").toByteArray(Charsets.UTF_8)
        out.execute {
            try {
                socket?.send(DatagramPacket(bytes, bytes.size, to, PORT))
            } catch (_: Exception) {
            }
        }
    }

    fun shout(vararg parts: Any) {
        val targets = LinkedHashSet<InetAddress>()
        for (nif in interfaces()) for (a in nif.interfaceAddresses) a.broadcast?.let { targets += it }
        targets += InetAddress.getByName("255.255.255.255")
        for (t in targets) send(t, *parts)
    }

    companion object {
        const val PORT = 47321
        const val TAG = "EE1"

        private fun interfaces(): List<NetworkInterface> = try {
            NetworkInterface.getNetworkInterfaces()?.toList().orEmpty().filter { it.isUp && !it.isLoopback }
        } catch (_: Exception) {
            emptyList()
        }

        fun addresses(): List<String> = interfaces().flatMap { nif ->
            nif.inetAddresses.toList().filterIsInstance<Inet4Address>().filter { !it.isLoopbackAddress && !it.isLinkLocalAddress }.map { it.hostAddress ?: "" }
        }.filter { it.isNotEmpty() }
    }
}
