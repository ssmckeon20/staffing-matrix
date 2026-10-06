import { useEffect, useState, useCallback } from "react";
import type { ChangeHistoryEntry } from "../lib/types";
import * as data from "../lib/data";
import { Button } from "./ui";
import { formatDateRange, getCurrentBiweeklyStart, addDays } from "../lib/helpers";

export default function HistoryTab() {
  const [history, setHistory] = useState<ChangeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const h = await data.fetchChangeHistory();
      setHistory(h);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const biweeklyStart = getCurrentBiweeklyStart();
  const biweeklyEnd = addDays(biweeklyStart, 13);

  if (loading) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page narrow-page">
      {error && <div className="error-banner">{error}</div>}
      <section className="page-heading">
        <div>
          <div className="title-row"><h1>Change history</h1></div>
          <p>Review every schedule update and staffing decision.</p>
        </div>
        <Button icon="calendar">{formatDateRange(biweeklyStart, biweeklyEnd)}</Button>
      </section>
      <section className="history-card">
        {history.length === 0 ? (
          <div className="team-empty">No changes recorded yet.</div>
        ) : (
          history.map((item) => (
            <div className="history-row" key={item.id}>
              <div className="history-line"><span /></div>
              <div className="history-content">
                <div>
                  <strong>{item.action_text}</strong>
                  <p>{item.user_name} · {new Date(item.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                <span className="history-tag">{item.category}</span>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
