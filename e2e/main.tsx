import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../app";
import {
  registered,
  QueryContext,
  queryClient,
  ComposerContext,
  experimental_ProviderModelPicker as Picker,
  providers,
} from "./sdk";
import "./style.css";

function App() {
  const [selection, setSelection] = useState({
    projectId: "p-aribills",
    providerId: "codex",
    model: "gpt-6.2-sol",
    reasoningLevel: "high",
    serviceTier: "default",
  });
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const Overlay = registered.overlay!,
    Settings = registered.settings!,
    Action = registered.action!;
  return (
    <QueryContext.Provider value={queryClient}>
      <main className={dark ? "dark" : ""}>
        <header>
          <div>
            <h1>Profiles</h1>
            <p>
              Isolated verification fixture. Example catalogs; no BB accounts or
              inference calls.
            </p>
          </div>
          <button onClick={() => setDark(!dark)}>Switch theme</button>
          <button onClick={() => setMounted(!mounted)}>
            {mounted ? "Unload plugin" : "Load plugin"}
          </button>
        </header>
        {mounted && <Overlay />}
        {mounted && <Settings />}
        <form
          className="fixture-composer"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitAttempts((count) => count + 1);
          }}
        >
          <h2>New-thread composer fixture</h2>
          <label>
            Provider{" "}
            <select
              value={selection.providerId}
              onChange={(event) =>
                setSelection({
                  ...selection,
                  providerId: event.target.value,
                  model: "",
                })
              }
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName}
                </option>
              ))}
            </select>
          </label>
          <Picker
            value={selection}
            onChange={(next) => setSelection({ ...selection, ...next })}
          />
          <ComposerContext.Provider
            value={{
              key: "fixture-draft",
              isEmpty: true,
              selection,
              isSubmitting: false,
              isRunning: false,
              setSelection: async (next) => {
                const result = { ...selection, ...next };
                setSelection(result);
                return result;
              },
            }}
          >
            {mounted && <Action />}
          </ComposerContext.Provider>
          <output aria-label="Composer selection">
            {JSON.stringify(selection)}
          </output>
          <textarea
            aria-label="Draft"
            defaultValue="Review the model settings without submitting any work."
          />
          <output aria-label="Submit attempts">{submitAttempts}</output>
        </form>
      </main>
    </QueryContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
