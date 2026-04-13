import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if Docker or Podman is installed and accessible
 * @returns {Promise<object>} Prerequisite check result
 * @property {boolean} installed - True if container runtime is available
 * @property {string} [runtime] - 'docker' or 'podman'
 * @property {string} [version] - Version if installed
 * @property {string} [error] - Error message if check failed
 * @property {string} [installUrl] - Installation URL if not installed
 */
export async function checkDocker() {
  // Check for Podman first (preferred)
  try {
    const { stdout: podmanWhich } = await execAsync('which podman');
    if (podmanWhich.trim()) {
      const { stdout: versionOutput } = await execAsync('podman --version');
      return {
        installed: true,
        runtime: 'podman',
        version: versionOutput.trim()
      };
    }
  } catch (e) {
    // Podman not found, try Docker
  }

  // Check for Docker
  try {
    const { stdout: whichOutput } = await execAsync('which docker');

    if (!whichOutput.trim()) {
      return {
        installed: false,
        installUrl: 'https://podman.io/getting-started/installation'
      };
    }

    // Get Docker version
    const { stdout: versionOutput } = await execAsync('docker --version');
    const version = versionOutput.trim();

    return {
      installed: true,
      runtime: 'docker',
      version: version
    };
  } catch (error) {
    // Neither found
    return {
      installed: false,
      error: 'Neither Podman nor Docker found',
      installUrl: 'https://podman.io/getting-started/installation'
    };
  }
}

/**
 * Check if docker-compose or podman-compose is available
 * @returns {Promise<object>} Prerequisite check result
 * @property {boolean} installed - True if compose is available
 * @property {string} [version] - Compose version if installed
 * @property {string} [method] - 'podman-compose', 'plugin' or 'standalone'
 * @property {string} [error] - Error message if check failed
 * @property {string} [installUrl] - Installation URL if not installed
 */
export async function checkDockerCompose() {
  // Try podman-compose first (for Podman users)
  try {
    const { stdout } = await execAsync('podman-compose --version');
    return {
      installed: true,
      version: stdout.trim(),
      method: 'podman-compose'
    };
  } catch (podmanComposeError) {
    // podman-compose not found, try docker compose (plugin)
    try {
      const { stdout } = await execAsync('docker compose version');
      return {
        installed: true,
        version: stdout.trim(),
        method: 'plugin'
      };
    } catch (pluginError) {
      // Plugin not found, try standalone docker-compose
      try {
        const { stdout } = await execAsync('docker-compose --version');
        return {
          installed: true,
          version: stdout.trim(),
          method: 'standalone'
        };
      } catch (standaloneError) {
        // Neither available
        return {
          installed: false,
          error: 'No compose tool found (podman-compose, docker compose, or docker-compose)',
          installUrl: 'https://podman.io/getting-started/installation'
        };
      }
    }
  }
}

/**
 * Check all prerequisites for Raspberry Pi deployment
 * @returns {Promise<Array>} Array of prerequisite check results
 */
export async function checkPiPrerequisites() {
  const checks = [];

  // Check container runtime (Docker or Podman)
  const dockerResult = await checkDocker();
  checks.push({
    name: dockerResult.runtime === 'podman' ? 'Podman' : 'Docker',
    installed: dockerResult.installed,
    version: dockerResult.version,
    error: dockerResult.error,
    installUrl: dockerResult.installUrl
  });

  // Check Compose (podman-compose or docker-compose)
  const composeResult = await checkDockerCompose();
  checks.push({
    name: composeResult.method === 'podman-compose' ? 'Podman Compose' : 'Docker Compose',
    installed: composeResult.installed,
    version: composeResult.version,
    error: composeResult.error,
    installUrl: composeResult.installUrl
  });

  return checks;
}