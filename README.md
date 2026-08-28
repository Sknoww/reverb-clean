<div align="center">
<pre>
██████╗ ███████╗██╗   ██╗███████╗██████╗ ██████╗
██╔══██╗██╔════╝██║   ██║██╔════╝██╔══██╗██╔══██╗
██████╔╝█████╗  ██║   ██║█████╗  ██████╔╝██████╔╝
██╔══██╗██╔══╝  ╚██╗ ██╔╝██╔══╝  ██╔══██╗██╔══██╗
██║  ██║███████╗ ╚████╔╝ ███████╗██║  ██║██████╔╝
╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═════╝
----------------------------------------
An Electron app for managing ADB commands
</pre>
</div>

## Overview

Reverb lets you simplify and automate ADB commands.

## User Guide

Screen-by-screen notes live in [docs/screens.md](docs/screens.md).

## Installation

Download the latest build for your platform from the [Releases page](https://github.com/Sknoww/reverb-clean/releases).

### Windows

1. Download the `.exe` installer
2. Run the installer and follow the on-screen instructions
3. Launch Reverb from the Start menu

### macOS

1. Download the `.dmg` file
2. Open the DMG and drag Reverb to your Applications folder
3. Open your terminal and run the following command to remove the quarantine flag:

```bash
sudo xattr -dr com.apple.quarantine /Applications/Reverb.app
```

4. Launch Reverb from the Applications folder

## Building from Source

If you prefer to build the app yourself, follow the steps below.

### Prerequisites

- [Node.js](https://nodejs.org/) (v24 or higher)
- [Git](https://git-scm.com/)
- npm (included with Node.js)

### 1. Clone the repository

```bash
git clone https://github.com/Sknoww/reverb-clean.git
cd reverb
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Build for your platform

#### Windows

```bash
npm run build:win
```

Once the build completes, the installer (`.exe`) will be located in the `release/` directory. Run the installer and follow the on-screen instructions.

#### macOS

```bash
npm run build:mac
```

Once the build completes, the disk image (`.dmg`) will be located in the `release/` directory. Open the DMG and drag Reverb to your Applications folder.

If macOS blocks the app from opening, run the following command to remove the quarantine flag:

```bash
sudo xattr -dr com.apple.quarantine /Applications/Reverb.app
```

### 4. Run in development mode (optional)

If you want to run the app without building an installer:

```bash
npm run dev
```

---

Made by Hunter Sullivan
