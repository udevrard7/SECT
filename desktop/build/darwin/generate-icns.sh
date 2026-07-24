#!/bin/bash
# À lancer sur macOS pour générer icon.icns depuis icon.iconset/
# (iconutil n'existe que sur macOS)
iconutil -c icns icon.iconset -o icon.icns
