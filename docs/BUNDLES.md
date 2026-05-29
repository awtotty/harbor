# Capability Bundles

Harbor bundles are optional capabilities users can install after the base appliance is running. They keep the default Docker image slim while making it easy to add CLIs, Pi packages, environment variables, setup directories, and custom installer behavior.

Bundles are declared in:

```text
bundles.default.json
```

At runtime Harbor exposes them in Config → Packages & bundles.

## Simple bundle

A simple bundle can be JSON-only:

```json
{
  "id": "example-cli",
  "name": "Example CLI",
  "description": "Install an npm CLI into persistent Harbor tools.",
  "npmGlobals": ["example-cli"],
  "checkCommands": ["example"],
  "dirs": ["/config/example"],
  "env": {
    "EXAMPLE_CONFIG_DIR": "/config/example"
  },
  "setup": ["example auth login"]
}
```

Install behavior:

- creates `dirs`
- merges `env` into `/config/harbor.env`
- installs `npmGlobals` with:
  ```bash
  npm install --global --prefix /config/tools/npm ...
  ```
- symlinks `checkCommands` from `/config/tools/npm/bin` into `/config/bin`
- installs any `piPackages`

Uninstall behavior:

- runs `npm uninstall --global --prefix /config/tools/npm ...`
- removes `checkCommands` symlinks from `/config/bin`
- removes bundle-managed env vars from `/config/harbor.env`
- does not delete user data directories by default

## Bundle with Pi packages

Bundles can install Pi packages/extensions too:

```json
{
  "id": "agent-tools",
  "name": "Agent Tools",
  "piPackages": [
    "npm:pi-web-access",
    "npm:context-mode"
  ]
}
```

## Custom installers

Some CLIs need special handling beyond generic npm/Pi package installation. Examples include downloading a platform-specific binary, patching generated shims, validating credentials, or cleaning up extra files on uninstall.

To add a custom installer:

1. Add an `installer` key in `bundles.default.json`:

   ```json
   {
     "id": "custom-tool",
     "name": "Custom Tool",
     "installer": "custom-tool",
     "npmGlobals": ["custom-tool"],
     "checkCommands": ["custom-tool"]
   }
   ```

2. Add an entry in `src/server/bundle-installers.ts`:

   ```ts
   export const bundleInstallers: Record<string, BundleInstaller> = {
     'custom-tool': {
       install: installCustomTool,
       uninstall: uninstallCustomTool,
     },
   };
   ```

3. Implement only the special behavior in that installer. Keep generic work — env merge, npm install/uninstall, command symlinks, Pi package install — in `src/server/bundles.ts`.

Custom installers receive:

- the bundle definition
- an event sink for progress
- a context with:
  - `npmPrefix`
  - `npmBin`
  - `runCommand(...)`

## PATH

Harbor terminals include these persistent tool paths:

```text
/config/bin
/config/tools/npm/bin
/home/agent/.local/bin
```

Prefer linking user-facing commands into `/config/bin` so agents and terminal users get a stable command path.
