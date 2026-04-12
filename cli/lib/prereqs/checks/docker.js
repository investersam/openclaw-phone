import { execSync } from 'child_process';

/**
 * Check Docker OR Podman installation and daemon status
 * @param {object} platform - Platform info from detectPlatform()
 * @returns {Promise<object>} Check result
 */
export async function checkDocker(platform) {
  // Check for Podman first (preferred)
  const podmanInstalled = checkPodmanInstalled();
  if (podmanInstalled.success) {
    const running = checkPodmanRunning();
    if (running.success) {
      return {
        name: 'Podman',
        passed: true,
        version: podmanInstalled.version,
        required: '>=4.0.0',
        message: `Podman v${podmanInstalled.version} ✓`,
        canAutoFix: false,
        isPodman: true
      };
    }
  }

  // Fall back to Docker
  const dockerInstalled = checkDockerInstalled();

  if (!dockerInstalled.success) {
    return {
      name: 'Container Runtime',
      passed: false,
      version: null,
      required: 'Podman or Docker',
      message: 'Podman or Docker not installed',
      canAutoFix: true,
      error: 'not_installed'
    };
  }

  // Check if daemon is running
  const running = checkDockerRunning();

  if (!running.success) {
    // Distinguish between permission denied and daemon not running
    if (running.error === 'permission_denied') {
      return {
        name: 'Docker',
        passed: false,
        version: dockerInstalled.version,
        required: '>=20.0.0',
        message: 'Docker installed but permission denied',
        canAutoFix: true,
        error: 'permission_denied'
      };
    }

    // Docker Desktop on macOS might be installed but not running
    if (platform.os === 'darwin') {
      return {
        name: 'Docker',
        passed: false,
        version: dockerInstalled.version,
        required: '>=20.0.0',
        message: 'Docker installed but daemon not running',
        canAutoFix: true,
        error: 'not_running'
      };
    }

    return {
      name: 'Docker',
      passed: false,
      version: dockerInstalled.version,
      required: '>=20.0.0',
      message: 'Docker installed but daemon not running',
      canAutoFix: true,
      error: 'not_running'
    };
  }

  // Both installed and running - success
  return {
    name: 'Docker',
    passed: true,
    version: dockerInstalled.version,
    required: '>=20.0.0',
    message: `Docker v${dockerInstalled.version}`,
    canAutoFix: false,
    isPodman: false
  };
}

/**
 * Check if Podman command is installed
 * @returns {{success: boolean, version?: string}} Result with version if installed
 */
function checkPodmanInstalled() {
  try {
    const output = execSync('podman --version', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    const version = parsePodmanVersion(output.trim());

    return {
      success: true,
      version: version || 'unknown'
    };
  } catch (error) {
    return {
      success: false
    };
  }
}

/**
 * Check if Podman machine is running
 * @returns {{success: boolean, error?: string}} Result
 */
function checkPodmanRunning() {
  try {
    execSync('podman ps', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: 'not_running'
    };
  }
}

/**
 * Check if docker command is installed
 * @returns {{success: boolean, version?: string}} Result with version if installed
 */
function checkDockerInstalled() {
  try {
    const output = execSync('docker --version', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    const version = parseDockerVersion(output.trim());

    return {
      success: true,
      version: version || 'unknown'
    };
  } catch (error) {
    return {
      success: false
    };
  }
}

/**
 * Check if Docker daemon is running
 * @returns {{success: boolean, error?: string}} Result
 */
function checkDockerRunning() {
  try {
    execSync('docker ps', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    return { success: true };
  } catch (error) {
    // Check if it's a permission error
    if (error.stderr && error.stderr.includes('permission denied')) {
      return {
        success: false,
        error: 'permission_denied'
      };
    }

    // Check if it's daemon not running error
    if (
      error.stderr &&
      (error.stderr.includes('Cannot connect to the Docker daemon') ||
       error.stderr.includes('Is the docker daemon running?'))
    ) {
      return {
        success: false,
        error: 'not_running'
      };
    }

    // Unknown error
    return {
      success: false,
      error: 'unknown'
    };
  }
}

/**
 * Parse Podman version from output
 * @param {string} output - Podman version output
 * @returns {string|null} Parsed version (e.g., "4.9.0")
 */
function parsePodmanVersion(output) {
  // podman version 4.9.0
  const match = output.match(/podman version ([\d.]+)/i);

  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Parse Docker version from output
 * @param {string} output - Docker version output
 * @returns {string|null} Parsed version (e.g., "24.0.7")
 */
function parseDockerVersion(output) {
  // Docker version 24.0.7, build afdd53b
  const match = output.match(/Docker version ([\d.]+)/);

  if (match) {
    return match[1];
  }

  return null;
}