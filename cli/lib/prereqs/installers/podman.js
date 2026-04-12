import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { withSudo } from '../utils/sudo.js';
import { checkDocker } from '../checks/docker.js';

/**
 * Install Podman (preferred over Docker)
 * @param {object} platform - Platform info from detectPlatform()
 * @returns {Promise<{success: boolean, cancelled?: boolean}>}
 */
export async function installPodman(platform) {
  console.log(chalk.bold.cyan('\n📦 Podman Installation (Recommended)\n'));
  console.log(chalk.gray('Podman is preferred over Docker because:'));
  console.log(chalk.gray('  • Rootless containers (more secure)'));
  console.log(chalk.gray('  • No daemon required'));
  console.log(chalk.gray('  • Compatible with Docker commands'));
  console.log('');

  // Confirm installation
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Install Podman automatically?',
      default: true
    }
  ]);

  if (!confirmed) {
    showPodmanManualInstructions(platform);
    return { success: false, cancelled: true };
  }

  // Route to platform-specific installer
  let result;

  switch (platform.packageManager) {
    case 'apt':
      result = await installPodmanApt();
      break;
    case 'dnf':
    case 'yum':
      result = await installPodmanDnf();
      break;
    case 'pacman':
      result = await installPodmanPacman();
      break;
    case 'brew':
      result = await installPodmanBrew();
      break;
    default:
      console.error(chalk.red(`\n❌ Unsupported package manager: ${platform.packageManager}`));
      showPodmanManualInstructions(platform);
      return { success: false };
  }

  if (!result.success) {
    return result;
  }

  // Initialize Podman machine on macOS
  if (platform.os === 'darwin') {
    await initializePodmanMachine();
  }

  // Verify installation
  console.log(chalk.cyan('\n✓ Verifying Podman installation...'));
  const check = await checkDocker(platform);

  if (check.passed) {
    console.log(chalk.green(`✓ ${check.message} installed successfully\n`));
    return { success: true };
  } else {
    console.error(chalk.red('\n❌ Podman installation verification failed'));
    return { success: false };
  }
}

/**
 * Install Podman on Ubuntu/Debian
 * @returns {Promise<{success: boolean}>}
 */
async function installPodmanApt() {
  console.log(chalk.cyan('\nInstalling Podman via apt...'));

  const commands = [
    'apt-get update',
    'apt-get install -y podman podman-compose'
  ];

  return await withSudo(commands);
}

/**
 * Install Podman on RHEL/Fedora
 * @returns {Promise<{success: boolean}>}
 */
async function installPodmanDnf() {
  console.log(chalk.cyan('\nInstalling Podman via dnf...'));

  const commands = [
    'dnf install -y podman podman-compose'
  ];

  return await withSudo(commands);
}

/**
 * Install Podman on Arch Linux
 * @returns {Promise<{success: boolean}>}
 */
async function installPodmanPacman() {
  console.log(chalk.cyan('\nInstalling Podman via pacman...'));

  const commands = [
    'pacman -Sy --noconfirm podman podman-compose'
  ];

  return await withSudo(commands);
}

/**
 * Install Podman on macOS via Homebrew
 * @returns {Promise<{success: boolean}>}
 */
async function installPodmanBrew() {
  console.log(chalk.cyan('\nInstalling Podman via Homebrew...'));

  try {
    execSync('brew install podman', {
      encoding: 'utf-8',
      stdio: 'inherit'
    });
    return { success: true };
  } catch (error) {
    console.error(chalk.red('\n❌ Failed to install Podman via Homebrew'));
    return { success: false };
  }
}

/**
 * Initialize Podman machine on macOS
 * @returns {Promise<void>}
 */
async function initializePodmanMachine() {
  console.log(chalk.cyan('\n🍎 Initializing Podman Machine (macOS)...'));
  console.log(chalk.gray('This creates a Linux VM for running containers.\n'));

  try {
    // Check if machine already exists
    try {
      execSync('podman machine list --format json', { encoding: 'utf-8' });
      console.log(chalk.gray('Podman machine already exists'));
    } catch (e) {
      // Initialize new machine
      console.log(chalk.cyan('Creating Podman machine...'));
      execSync('podman machine init', {
        encoding: 'utf-8',
        stdio: 'inherit'
      });
    }

    // Start the machine
    console.log(chalk.cyan('Starting Podman machine...'));
    execSync('podman machine start', {
      encoding: 'utf-8',
      stdio: 'inherit'
    });

    console.log(chalk.green('✓ Podman machine ready'));
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not initialize Podman machine'));
    console.log(chalk.gray('Run manually: podman machine init && podman machine start'));
  }
}

/**
 * Show manual installation instructions for Podman
 * @param {object} platform - Platform info
 * @returns {void}
 */
function showPodmanManualInstructions(platform) {
  console.log(chalk.yellow('\n📋 Manual Podman Installation\n'));

  switch (platform.packageManager) {
    case 'apt':
      console.log(chalk.gray('For Ubuntu/Debian:\n'));
      console.log(chalk.cyan('  sudo apt-get update'));
      console.log(chalk.cyan('  sudo apt-get install -y podman podman-compose\n'));
      break;

    case 'dnf':
    case 'yum':
      console.log(chalk.gray('For RHEL/Fedora:\n'));
      console.log(chalk.cyan('  sudo dnf install -y podman podman-compose\n'));
      break;

    case 'pacman':
      console.log(chalk.gray('For Arch Linux:\n'));
      console.log(chalk.cyan('  sudo pacman -Sy podman podman-compose\n'));
      break;

    case 'brew':
      console.log(chalk.gray('For macOS:\n'));
      console.log(chalk.cyan('  brew install podman'));
      console.log(chalk.cyan('  podman machine init'));
      console.log(chalk.cyan('  podman machine start\n'));
      break;

    default:
      console.log(chalk.gray('See: https://podman.io/getting-started/installation\n'));
  }

  console.log(chalk.gray('After installation, run "claude-phone setup" again.\n'));
}