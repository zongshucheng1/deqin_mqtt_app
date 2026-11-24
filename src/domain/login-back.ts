/** Native back preserves login input until the user explicitly allows leaving. */
export function loginBackHandler(options: {
  busy: () => boolean;
  hasInput: () => boolean;
  allowExit: () => Promise<boolean>;
  exit: () => void;
}) {
  return () => {
    if (options.busy()) return true;
    if (options.hasInput()) {
      void options.allowExit().then((allowed) => {
        if (allowed) options.exit();
      });
      return true;
    }
    return false;
  };
}
