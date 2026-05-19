#!/bin/bash
# Wrapper script to run CatisTlm tools with bundled libraries

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Set LD_LIBRARY_PATH to include our bundled lib directory
export LD_LIBRARY_PATH="$DIR/lib:$LD_LIBRARY_PATH"

if [ "$#" -eq 0 ]; then
    echo "Usage: ./run.sh <tool_name> [args...]"
    echo "Available tools in bin/ :"
    ls -1 "$DIR/bin/"
    exit 1
fi

TOOL="$1"
shift

if [ ! -x "$DIR/bin/$TOOL" ]; then
    echo "Error: Tool '$TOOL' not found in $DIR/bin/"
    exit 1
fi

# Execute the tool with the remaining arguments
exec "$DIR/bin/$TOOL" "$@"
