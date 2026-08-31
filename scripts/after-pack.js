const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

exports.default = function (context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  console.log('Mac build context:', context.appOutDir)

  console.log('Listing Resources directory:')
  try {
    execSync(`ls -la "${context.appOutDir}/Reverb.app/Contents/Resources/"`, { stdio: 'inherit' })
  } catch (err) {
    console.log('Error listing Resources directory:', err.message)
  }

  // extraResources keeps its directory name inside the app bundle.
  const possiblePaths = [
    path.join(context.appOutDir, 'Reverb.app/Contents/Resources/extraResources/adbMac/adb'),
    path.join(context.appOutDir, 'Reverb.app/Contents/Resources/extraResources/adb')
  ]

  let adbFound = false

  for (const adbPath of possiblePaths) {
    console.log(`Checking if ADB exists at: ${adbPath}`)

    if (fs.existsSync(adbPath)) {
      console.log(`Setting executable permissions for: ${adbPath}`)
      try {
        execSync(`chmod +x "${adbPath}"`)
        console.log('Successfully set permissions')
        adbFound = true
        break
      } catch (err) {
        console.error(`Error setting permissions: ${err.message}`)
      }
    }
  }

  if (!adbFound) {
    console.log('ADB executable not found. Searching in app directory...')

    try {
      const result = execSync(`find "${context.appOutDir}" -name "adb" -type f`, {
        encoding: 'utf8'
      })
      if (result.trim()) {
        const foundPaths = result.trim().split('\n')
        console.log('Found ADB at:', foundPaths)

        for (const foundPath of foundPaths) {
          console.log(`Setting executable permissions for: ${foundPath}`)
          execSync(`chmod +x "${foundPath}"`)
        }
      } else {
        console.log('No ADB executable found in the app directory')
      }
    } catch (err) {
      console.error(`Error searching for ADB: ${err.message}`)
    }
  }
}
