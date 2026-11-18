/** Each step of a BoM eases in when you move between steps; the step rail and the views stay put. */
export default function BomStepTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
