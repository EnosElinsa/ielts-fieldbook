export function SaveFailure({ failed }: { failed: boolean }) {
  if (!failed) return null;
  return (
    <p className="save-failure" role="status">
      Could not save to your account. Try again.
    </p>
  );
}
