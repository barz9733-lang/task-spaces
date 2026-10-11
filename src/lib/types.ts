export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "new" | "in_progress" | "on_hold" | "done";
export type ViewType = "kanban" | "todo" | "calendar";

export interface Space {
  id: string;
  name: string;
  color: string;
  view: ViewType;
  position: number;
}

export interface Task {
  id: string;
  space_id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  due_date: string | null; // YYYY-MM-DD
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  dashboard_spaces: string[] | null; // null = all spaces
}

export interface AppData {
  spaces: Space[];
  tasks: Task[];
  settings: Settings;
}

export type TaskInput = {
  space_id: string;
  title: string;
  description?: string;
  priority?: Priority;
  status?: Status;
  due_date?: string | null;
};

export type TaskPatch = Partial<Omit<TaskInput, never>>;

export type AgentScope = { type: "all" } | { type: "space"; spaceId: string };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
