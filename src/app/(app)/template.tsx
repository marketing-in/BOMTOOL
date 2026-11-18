/** Each page of the app eases in when you move between parts, instead of snapping in. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
