const API_BASE = "/.netlify/functions";

interface AuthResponse {
  token: string;
  user: { id: number; email: string };
}

interface MeResponse {
  user: { id: number; email: string };
}

export interface Passage {
  id: number;
  section_id: number;
  reference: string;
  description: string;
  sort_order: number;
}

export interface Section {
  id: number;
  project_id: number;
  name: string;
  sort_order: number;
  passages: Passage[];
}

export interface Project {
  id: number;
  name: string;
  sections: Section[];
}

interface ProjectListResponse {
  projects: { id: number; name: string }[];
}

interface ProjectDetailResponse {
  project: Project;
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Signup failed");
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  return data;
}

export async function getMe(token: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Unauthorized");
  return data;
}

export async function getProjects(token: string): Promise<ProjectListResponse> {
  const res = await fetch(`${API_BASE}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch projects");
  return data;
}

export async function getProject(token: string, id: number): Promise<ProjectDetailResponse> {
  const res = await fetch(`${API_BASE}/projects?id=${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch project");
  return data;
}

export async function createSection(
  token: string,
  projectId: number,
  name: string
): Promise<{ section: Section }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ projectId, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create section");
  return data;
}

export async function deleteSection(
  token: string,
  sectionId: number
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/projects?sectionId=${sectionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete section");
  return data;
}

export async function createPassage(
  token: string,
  sectionId: number,
  reference: string,
  sortOrder: number
): Promise<{ passage: Passage }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sectionId, reference, sortOrder }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create passage");
  return data;
}
