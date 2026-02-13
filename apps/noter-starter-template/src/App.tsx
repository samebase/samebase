import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import "./App.css";

type Todo = {
  _id: string;
  text: string;
  done: boolean;
};

function readTodos(value: unknown): Todo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const todos: Todo[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const id = Reflect.get(item, "_id");
    const text = Reflect.get(item, "text");
    const done = Reflect.get(item, "done");

    if (typeof id === "string" && typeof text === "string" && typeof done === "boolean") {
      todos.push({
        _id: id,
        text,
        done,
      });
    }
  }

  return todos;
}

function App() {
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const rawTodos = useQuery("todos:list", {});
  const todos = useMemo(() => readTodos(rawTodos), [rawTodos]);
  const createTodo = useMutation("todos:create");
  const toggleTodo = useMutation("todos:toggle");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      await createTodo({ text });
      setDraft("");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="app-shell">
      <Card>
        <CardHeader>
          <CardTitle>Noter Starter</CardTitle>
          <CardDescription>
            React + Vite + Convex + Tailwind + shadcn with a minimal todo CRUD flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={onSubmit} className="flex gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ship starter repo seeding"
              disabled={isSaving}
            />
            <Button type="submit" disabled={isSaving || draft.trim().length === 0}>
              {isSaving ? "Saving..." : "Add"}
            </Button>
          </form>

          <ul className="space-y-2">
            {todos.map((todo) => {
              const checkboxId = `todo-${todo._id}`;
              return (
                <li key={todo._id}>
                  <div className="flex items-center gap-3 rounded-md border px-3 py-2 transition hover:bg-secondary/50">
                    <Checkbox
                      id={checkboxId}
                      checked={todo.done}
                      onCheckedChange={() => void toggleTodo({ id: todo._id })}
                    />
                    <label
                      htmlFor={checkboxId}
                      className={`flex-1 cursor-pointer text-sm ${
                        todo.done ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {todo.text}
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}

export default App;
