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

Access the Reverb User Guide on Confluence here: [User Guide](https://teamviewer.atlassian.net/wiki/x/WQATIw)

## Installation

Download the latest build for your platform from [OneDrive](https://teamviewer-my.sharepoint.com/:f:/p/hunter_sullivan/IgDc4vd0PCaftT5bf8uw6GPJi0AYug9Uop6kTHgeFLbPV4n8E?e=TM8vNC).

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
git clone https://git.ubimax.com/customer_projects/pepsi-wes/pepsi_wes/tools/reverb.git
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
