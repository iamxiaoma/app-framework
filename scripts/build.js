/* Purpose: Fix code, bump version, create build, create snapshot */

'use strict'

// Import modules
let env = require('../env')
let alert = require('../lib/alert')
let cmd = require('../lib/cmd')
let found = require('../lib/found')
let jsonScheme = require('../lib/json-scheme')
let fs = require('fs-extra')
let img = require('jimp')
let abs = require('path').resolve
let rec = require('recursive-readdir')
let ver = require('semver')
let webpack = require('webpack')

// Define build mode
let mode
if (env.arg.dev === true) {
  mode = 'dev'
} else if (env.arg.patch === true) {
  mode = 'patch'
} else if (env.arg.minor === true) {
  mode = 'minor'
} else if (env.arg.major === true) {
  mode = 'major'
} else {
  alert('Build script must have one argument of dev, patch, minor or major.', 'error')
}

// Step: Fix code
let fixCode = function (callback) {
  if (env.cfg.fixCodeOnBuild === true) {
    cmd(__dirname, 'node code-check --fix', function () {
      callback()
    })
  } else {
    callback()
  }
}

// Step: Build webpack
let buildWebpack = function (callback) {
  alert('Webpack build process ongoing - please wait ...')
  let webpackConfig = require('../lib/webpack-config').production
  // Empty webpack cache folder
  fs.emptyDir(abs(env.cache, 'build/www'), function (err) {
    if (err) {
      alert('Clean-up of the webpack cache folder failed.', 'issue')
    } else {
      // Build webpack to cache
      webpack(webpackConfig, function (err, stats) {
        if (err) {
          alert('Webpack build process failed.', 'issue')
        } else {
          alert('Webpack build process done.')
          callback()
        }
      })
    }
  })
}

// Step: Update license date
let updateLicense = function (callback) {
  if (env.installed === false) {
    alert('License update ongoing - please wait ...')
    let file = abs(env.proj, 'LICENSE')
    let text = fs.readFileSync(file, 'utf8')
    text = text.replace(/Copyright \(c\) ([0-9]{4}) scriptPilot/, 'Copyright (c) ' + (new Date()).getFullYear() + ' scriptPilot')
    fs.writeFileSync(file, text)
    alert('License update done.')
    callback()
  } else {
    callback()
  }
}

// Step: Update documentation
let updateDocumentation = function (callback) {
  if (env.installed === false) {
    alert('Documentation update ongoing - please wait ...')
    let update = jsonScheme.markdown(abs(__dirname, '../config-scheme.json'), abs(__dirname, '../DOCUMENTATION.md'), 'config-options')
    if (Array.isArray(update)) {
      alert('Failed to update the documentation file.\n' + update.join('\n'), 'issue')
    } else {
      alert('Documentation update done.')
      callback()
    }
  } else {
    callback()
  }
}

// Step: Manage icons
let manageIcons = function (callback) {
  alert('Browserconfig and manifest creation ongoing - please wait ...')
  try {
    // Copy main icon file
    let iconFile = abs(env.app, 'icon.png')
    if (!found(iconFile)) {
      alert('Cannot find "icon.png" file.', 'error')
    }
    fs.copySync(iconFile, abs(env.cache, 'build/icon.png'))
    // Create manifest file (see http://realfavicongenerator.net/faq for details)
    let manifest = {
      name: env.cfg.title,
      icons: [
        {
          'src': 'android-chrome-192x192.png',
          'sizes': '192x192',
          'type': 'image/png'
        },
        {
          'src': 'android-chrome-512x512.png',
          'sizes': '512x512',
          'type': 'image/png'
        }
      ],
      theme_color: env.cfg.iconBackgroundColor,
      background_color: env.cfg.iconBackgroundColor,
      display: 'standalone'
    }
    fs.writeJsonSync(abs(env.cache, 'build/www/manifest.json'), manifest, {spaces: 0})
    // Create browserconfig file
    let xml = '<?xml version="1.0" encoding="utf-8"?>' +
              '<browserconfig>' +
                '<msapplication>' +
                  '<tile>' +
                    '<square150x150logo src="mstile-150x150.png"/>' +
                    '<TileColor>#da532c</TileColor>' +
                  '</tile>' +
                '</msapplication>' +
              '</browserconfig>'
    fs.writeFileSync(abs(env.cache, 'build/www/browserconfig.xml'), xml)
    // Copy icon files (see http://realfavicongenerator.net/faq for details)
    let iconCacheFolder = abs(env.cache, 'icons/dev')
    let iconFiles = fs.readdirSync(iconCacheFolder)
    iconFiles.map(i => {
      if (/^(favicon|android-chrome|mstile|apple-touch-icon)/.test(i) === true) {
        fs.copySync(abs(iconCacheFolder, i), abs(env.cache, 'build/www', i))
      }
    })
    // Rename Apple touch icon
    fs.renameSync(abs(env.cache, 'build/www/apple-touch-icon-180x180.png'), abs(env.cache, 'build/www/apple-touch-icon.png'))
    // Delete Framework7 icon from CSS file >> removed due to 404 error in browser
    // Copy store icons
    iconFiles.map(i => {
      if (/^(.+)-store-(.+)/.test(i) === true) {
        fs.copySync(abs(iconCacheFolder, i), abs(env.cache, 'build', i.replace(/^(.+)-store-icon(.+)\.png/, '$1-store-icon.png')))
      }
    })
    // Callback
    callback()
  } catch (err) {
    alert('Browserconfig and manifest creation failed.', 'issue')
  }
}

// Step: Copy Firebase files
let copyFirebaseFiles = function (callback) {
  alert('Firebase files update ongoing - please wait ...')
  fs.copy(abs(env.app, 'database-rules.json'), abs(env.cache, 'build/database-rules.json'), err => {
    if (err) {
      alert('Failed to copy "database-rules.json" file.', 'issue')
    } else {
      fs.copy(abs(env.app, 'storage-rules.txt'), abs(env.cache, 'build/storage-rules.txt'), err => {
        if (err) {
          alert('Failed to copy "database-rules.json" file.', 'issue')
        } else {
          alert('Firebase files update done.')
          callback()
        }
      })
    }
  })
}

// Step: Compress images
let compressImages = function (callback, files) {
  if (files === undefined) {
    alert('Images compression ongoing - please wait ...')
    rec(abs(env.cache, 'build/www/img'), function (err, files) {
      if (err) {
        alert('Failed to read image files.' + err, 'issue')
      } else {
        compressImages(callback, files)
      }
    })
  } else if (Array.isArray(files) && files.length > 0) {
    let file = files.shift()
    if (/\.jpg$/.test(file)) {
      let original = abs(file)
      let compressed = abs(file.replace(/\.jpg$/, '.temp.jpg'))
      img.read(original, function (err, image) {
        if (err) {
          alert('Failed to read image file.', 'issue')
        } else {
          image.quality(60, function (err, image) {
            if (err) {
              alert('Failed to compress JPG file.', 'issue')
            } else {
              image.write(compressed, function (err) {
                if (err) {
                  alert('Failed to write compressed image file.', 'issue')
                } else {
                  try {
                    let originalStat = fs.statSync(original)
                    let compressedStat = fs.statSync(compressed)
                    if (originalStat.size > compressedStat.size) {
                      fs.removeSync(original)
                      fs.renameSync(compressed, original)
                    } else {
                      fs.removeSync(compressed)
                    }
                    compressImages(callback, files)
                  } catch (err) {
                    alert('Failed to compress JPG images.', 'issue')
                  }
                }
              })
            }
          })
        }
      })
    } else {
      compressImages(callback, files)
    }
  } else {
    alert('Image compression done.')
    callback()
  }
}

// Run steps
fixCode(function () {
  cmd(__dirname, 'node update-routes', function () {
    if (mode !== 'dev') {
      // Update version in package.json
      let pkg = fs.readJsonSync(abs(env.proj, 'package.json'))
      pkg.version = ver.inc(pkg.version, mode)
      fs.writeJsonSync(abs(env.proj, 'package.json'), pkg)
      env.pkg.version = pkg.version
      require.cache = {}
    }
    updateLicense(function () {
      updateDocumentation(function () {
        fs.emptyDir(abs(env.cache, 'build'), function (err) {
          if (err) {
            alert('Failed to empty build folder in cache.', 'issue')
          } else {
            buildWebpack(function () {
              cmd(__dirname, 'node create-icons', function () {
                manageIcons(function () {
                  copyFirebaseFiles(function () {
                    // Dev build
                    if (mode === 'dev') {
                      alert('Development build done.')
                    // Pruduction build
                    } else {
                      alert('Build folder update ongoing - please wait ...')
                      // Empty existing build folder
                      fs.emptyDir(abs(env.proj, 'build'), function (err) {
                        if (err) {
                          alert('Clean-up the existing build folder failed.', 'issue')
                        } else {
                          // Copy files
                          fs.copy(abs(env.cache, 'build'), abs(env.proj, 'build'), function (err) {
                            if (err) {
                              alert('Build folder update failed.', 'issue')
                            } else {
                              compressImages(function () {
                                // Create snapshot
                                cmd(__dirname, 'node create-snapshot --name "build-' + env.pkg.version + '"', function () {
                                  alert('Build process done for version ' + env.pkg.version + '.')
                                })
                              })
                            }
                          })
                        }
                      })
                    }
                  })
                })
              })
            })
          }
        })
      })
    })
  })
})
