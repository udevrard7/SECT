#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# build_shared_framework.sh
#
# Builds the Shared.framework from the Kotlin Multiplatform shared module
# and copies it to the location expected by the Xcode project.
#
# Usage:
#   Called automatically by Xcode's "Run Script" build phase, or manually:
#     ./build_shared_framework.sh              # auto-detect simulator vs device
#     ./build_shared_framework.sh --simulator   # force simulator build
#     ./build_shared_framework.sh --device      # force device build
#
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ──
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHARED_MODULE=":shared"
FRAMEWORK_NAME="Shared"
FRAMEWORK_OUTPUT_DIR="${PROJECT_ROOT}/iosApp/Frameworks"
GRADLEW="${PROJECT_ROOT}/gradlew"

# ── Detect build target ──
FORCE_SIMULATOR=false
FORCE_DEVICE=false

for arg in "$@"; do
    case "$arg" in
        --simulator) FORCE_SIMULATOR=true ;;
        --device)    FORCE_DEVICE=true ;;
        *)           echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

# Determine the Kotlin/Native target based on architecture
determine_target() {
    if [[ "$FORCE_DEVICE" == true ]]; then
        echo "iosArm64"
        return
    fi

    if [[ "$FORCE_SIMULATOR" == true ]]; then
        echo "iosSimulatorArm64"
        return
    fi

    # Auto-detect from Xcode build settings or system architecture
    local sdk_name="${SDKROOT:-}"
    local archs="${ARCHS:-}"

    # If running inside Xcode (SDKROOT is set)
    if [[ -n "$sdk_name" ]]; then
        case "$sdk_name" in
            iphoneos)
                echo "iosArm64"
                return
                ;;
            iphonesimulator)
                # Check if we're on Apple Silicon (arm64) or Intel (x86_64)
                if [[ "$archs" == *"arm64"* ]]; then
                    echo "iosSimulatorArm64"
                else
                    echo "iosX64"
                fi
                return
                ;;
        esac
    fi

    # Fallback: detect from host architecture
    local host_arch
    host_arch="$(uname -m)"
    if [[ "$host_arch" == "arm64" ]]; then
        echo "iosSimulatorArm64"
    else
        echo "iosX64"
    fi
}

# ── Build ──
TARGET="$(determine_target)"

# Map target to Gradle task
case "$TARGET" in
    iosArm64)
        GRADLE_TASK="${SHARED_MODULE}:linkDebugFrameworkIosArm64"
        ;;
    iosSimulatorArm64)
        GRADLE_TASK="${SHARED_MODULE}:linkDebugFrameworkIosSimulatorArm64"
        ;;
    iosX64)
        GRADLE_TASK="${SHARED_MODULE}:linkDebugFrameworkIosX64"
        ;;
    *)
        echo "❌ Unsupported target: $TARGET"
        exit 1
        ;;
esac

echo "──────────────────────────────────────────────"
echo "🔧 Building Shared.framework for $TARGET"
echo "   Gradle task: $GRADLE_TASK"
echo "──────────────────────────────────────────────"

# Run Gradle
cd "$PROJECT_ROOT"
"$GRADLEW" "$GRADLE_TASK" -q

# ── Copy framework to expected location ──
# Gradle output path for K/N frameworks:
#   shared/build/bin/{target}/debugFramework/Shared.framework
GRADLE_FRAMEWORK="${PROJECT_ROOT}/shared/build/bin/${TARGET}/debugFramework/${FRAMEWORK_NAME}.framework"

if [[ ! -d "$GRADLE_FRAMEWORK" ]]; then
    echo "❌ Framework not found at: $GRADLE_FRAMEWORK"
    echo "   Did the Gradle build succeed?"
    exit 1
fi

# Create output directory
mkdir -p "$FRAMEWORK_OUTPUT_DIR"

# Remove old framework if present
if [[ -d "${FRAMEWORK_OUTPUT_DIR}/${FRAMEWORK_NAME}.framework" ]]; then
    rm -rf "${FRAMEWORK_OUTPUT_DIR}/${FRAMEWORK_NAME}.framework"
fi

# Copy the freshly built framework
cp -R "$GRADLE_FRAMEWORK" "${FRAMEWORK_OUTPUT_DIR}/"

echo "✅ ${FRAMEWORK_NAME}.framework copied to: ${FRAMEWORK_OUTPUT_DIR}/"
echo "   Target: $TARGET"
echo "──────────────────────────────────────────────"
