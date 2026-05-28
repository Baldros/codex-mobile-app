package expo.modules.codexsshtunnel

import com.jcraft.jsch.JSch
import com.jcraft.jsch.Session
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Properties

internal class CodexSshTunnelException(message: String, cause: Throwable? = null) :
  CodedException(message, cause)

class CodexSshTunnelModule : Module() {
  private val lock = Any()
  private var session: Session? = null
  private var localBindHost: String = "127.0.0.1"
  private var localBindPort: Int = 18080
  private var assignedPort: Int = 18080
  private var activeEndpoint: String? = null

  override fun definition() = ModuleDefinition {
    Name("CodexSshTunnel")

    AsyncFunction("startTunnelAsync") Coroutine { options: Map<String, Any?> ->
      startTunnel(options)
    }

    AsyncFunction("stopTunnelAsync") {
      stopTunnel()
    }

    AsyncFunction("getStatusAsync") {
      statusMap()
    }
  }

  private fun startTunnel(options: Map<String, Any?>): Map<String, Any?> {
    synchronized(lock) {
      val existing = session
      if (existing?.isConnected == true) {
        return statusMap("ready")
      }

      stopTunnelLocked()

      val sshHost = requiredString(options, "sshHost")
      val sshPort = intValue(options, "sshPort", 22)
      val username = requiredString(options, "username")
      val password = stringValue(options, "password")
      val privateKeyPem = stringValue(options, "privateKeyPem")
      val privateKeyPassphrase = stringValue(options, "privateKeyPassphrase")
      val remoteApiHost = stringValue(options, "remoteApiHost") ?: "127.0.0.1"
      val remoteApiPort = intValue(options, "remoteApiPort", 8787)
      val connectTimeoutMs = intValue(options, "connectTimeoutMs", 9000)
      val strictHostKeyChecking = boolValue(options, "strictHostKeyChecking", false)

      localBindHost = stringValue(options, "localBindHost") ?: "127.0.0.1"
      localBindPort = intValue(options, "localBindPort", 18080)
      activeEndpoint = "$sshHost:$sshPort"

      try {
        val jsch = JSch()
        if (!privateKeyPem.isNullOrBlank()) {
          jsch.addIdentity(
            "codex-mobile",
            privateKeyPem.toByteArray(Charsets.UTF_8),
            null,
            privateKeyPassphrase?.toByteArray(Charsets.UTF_8)
          )
        }

        val nextSession = jsch.getSession(username, sshHost, sshPort)
        if (!password.isNullOrEmpty()) {
          nextSession.setPassword(password)
        }

        val config = Properties()
        config["StrictHostKeyChecking"] = if (strictHostKeyChecking) "yes" else "no"
        nextSession.setConfig(config)
        nextSession.connect(connectTimeoutMs)
        assignedPort = nextSession.setPortForwardingL(
          localBindHost,
          localBindPort,
          remoteApiHost,
          remoteApiPort
        )
        session = nextSession
        return statusMap("ready")
      } catch (error: Throwable) {
        stopTunnelLocked()
        throw CodexSshTunnelException("Failed to start SSH tunnel through $activeEndpoint.", error)
      }
    }
  }

  private fun stopTunnel() {
    synchronized(lock) {
      stopTunnelLocked()
    }
  }

  private fun stopTunnelLocked() {
    val current = session
    session = null
    if (current != null) {
      try {
        current.delPortForwardingL(localBindHost, assignedPort)
      } catch (_: Throwable) {
      }
      try {
        current.disconnect()
      } catch (_: Throwable) {
      }
    }
    activeEndpoint = null
  }

  private fun statusMap(state: String? = null): Map<String, Any?> {
    val connected = session?.isConnected == true
    return mapOf(
      "state" to (state ?: if (connected) "ready" else "disconnected"),
      "connected" to connected,
      "localBindHost" to localBindHost,
      "localBindPort" to localBindPort,
      "assignedPort" to assignedPort,
      "activeEndpoint" to activeEndpoint
    )
  }

  private fun requiredString(options: Map<String, Any?>, key: String): String {
    return stringValue(options, key)
      ?: throw CodexSshTunnelException("Missing required SSH tunnel option: $key")
  }

  private fun stringValue(options: Map<String, Any?>, key: String): String? {
    return stringValue(options[key])
  }

  private fun stringValue(value: Any?): String? {
    return (value as? String)?.trim()?.takeIf { it.isNotEmpty() }
  }

  private fun intValue(options: Map<String, Any?>, key: String, fallback: Int): Int {
    val value = options[key]
    return when (value) {
      is Int -> value
      is Double -> value.toInt()
      is Number -> value.toInt()
      is String -> value.toIntOrNull()
      else -> null
    }?.takeIf { it > 0 } ?: fallback
  }

  private fun boolValue(options: Map<String, Any?>, key: String, fallback: Boolean): Boolean {
    return when (val value = options[key]) {
      is Boolean -> value
      is String -> when (value.trim().lowercase()) {
        "1", "true", "yes", "on" -> true
        "0", "false", "no", "off" -> false
        else -> fallback
      }
      else -> fallback
    }
  }
}
