export interface Skill {
  id: string;
  name: string;
  category: string | null;
  isActive: boolean;
}

export interface MemberSkill {
  id: string;
  skillId: string;
  level: number;
  skill: Skill;
}

export interface ProjectRole {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
}

export interface MemberProjectRole {
  id: string;
  projectRoleId: string;
  dateAwarded: string | null;
  createdAt: string;
  projectRole: ProjectRole;
}

export interface Member {
  id: string;
  employeeId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  managerId: string | null;
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  resume: string | null;
  certification: string | null;
  training: string | null;
  education: string | null;
  notes: string | null;
  isActive: boolean;
  skills: MemberSkill[];
  projectRoles: MemberProjectRole[];
  createdAt: string;
  updatedAt: string;
  workingHours?: {
    mon?: { start: string; end: string };
    tue?: { start: string; end: string };
    wed?: { start: string; end: string };
    thu?: { start: string; end: string };
    fri?: { start: string; end: string };
    sat?: { start: string; end: string };
    sun?: { start: string; end: string };
  } | null;
  metadata?: {
    hideFromSchedule?: boolean;
    [key: string]: unknown;
  };
}
