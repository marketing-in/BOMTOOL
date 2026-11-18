/** Shown the moment a step is chosen, while its page loads: the step rail and views stay, the page sketches itself. */
export default function StepLoading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse space-y-6">
      <div className="h-9 w-64 rounded-md bg-muted" />
      <div className="flex gap-2">
        <div className="h-10 w-32 rounded-md bg-muted" />
        <div className="h-10 w-32 rounded-md bg-muted" />
      </div>
      <div className="h-72 rounded-xl border bg-muted/50" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl border bg-muted/50" />
        ))}
      </div>
    </div>
  );
}
