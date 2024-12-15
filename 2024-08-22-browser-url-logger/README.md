# Browser URL Logger Extension

Logs newly visited or activated tab page URLs and titles.

## Install

1. Install the local server listening for the URL log requests
   ```sh
   cd native_messaging_host
   ./install.rb "path/to/logging/binary"
   ```

   Check URL logger implementation for parameters your logging binary needs to accept.

   Make sure your PATH is set correctly inside the generated wrapper script since the browser does not have your shell
   environment.

2. Build the extension
   ```sh
   cd extension/firefox
   web-ext build
   ```
