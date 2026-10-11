"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page">
      <div className="empty">
        <strong>משהו השתבש בטעינת הנתונים</strong>
        <p>בדקו את החיבור ונסו שוב.</p>
        <button className="btn btn-primary" onClick={reset}>
          נסו שוב
        </button>
      </div>
    </div>
  );
}
