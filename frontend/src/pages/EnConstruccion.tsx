export function EnConstruccion({ titulo }: { titulo: string }) {
  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>{titulo}</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Esta pantalla todavía no está construida. El backend ya tiene todos los endpoints listos.
      </p>
    </div>
  );
}
