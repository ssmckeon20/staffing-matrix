import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  employee_id: string | null;
}

export interface Site {
  id: string;
  name: string;
  cost_center_number: string;
}

export type SiteRole = "owner" | "admin" | "viewer";

export interface Membership {
  site: Site;
  role: SiteRole;
}

interface AuthContextValue {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  activeSite: Site | null;
  activeRole: SiteRole | null;
  canEdit: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  signOut: () => Promise<void>;
  createSite: (name: string, costCenter: string) => Promise<void>;
  deleteSite: (siteId: string) => Promise<void>;
  setActiveSiteId: (id: string) => void;
  refresh: () => Promise<void>;
  error: string;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTIVE_SITE_KEY = "shiftline-active-site";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeSiteId, setActiveId] = useState<string | null>(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(ACTIVE_SITE_KEY) : null
  );
  const [error, setError] = useState("");

  const clearError = useCallback(() => setError(""), []);

  const loadUserData = useCallback(async (userId: string) => {
    const [{ data: prof, error: pErr }, { data: mems, error: mErr }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("site_members")
        .select("role, site:sites(id, name, cost_center_number)")
        .eq("user_id", userId),
    ]);
    if (pErr) throw pErr;
    if (mErr) throw mErr;
    setProfile((prof as Profile) ?? null);
    const list = (mems ?? [])
      .filter((m) => m.site)
      .map((m) => ({ site: m.site as unknown as Site, role: m.role as SiteRole }));
    setMemberships(list);
  }, []);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session ?? null);
        if (data.session) return loadUserData(data.session.user.id);
      })
      .catch((e: unknown) => setError(String((e as Error)?.message ?? e)))
      .finally(() => setReady(true));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
      if (session) {
        (async () => {
          try {
            await loadUserData(session.user.id);
          } catch (e) {
            setError(String((e as Error).message ?? e));
          }
        })();
      } else {
        setProfile(null);
        setMemberships([]);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) throw err;
  }, []);

  const signUp = useCallback(async (email: string, password: string, firstName: string, lastName: string) => {
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName } },
    });
    if (err) throw err;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setActiveId(null);
    if (typeof localStorage !== "undefined") localStorage.removeItem(ACTIVE_SITE_KEY);
  }, []);

  const createSite = useCallback(async (name: string, costCenter: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("Not signed in.");
    const { data: site, error: err } = await supabase
      .from("sites")
      .insert({ name, cost_center_number: costCenter, created_by: userId })
      .select("id, name, cost_center_number")
      .single();
    if (err) throw err;
    const { error: memErr } = await supabase
      .from("site_members")
      .insert({ site_id: site.id, user_id: userId, role: "owner" });
    if (memErr) throw memErr;
    setActiveId(site.id);
    if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_SITE_KEY, site.id);
    await loadUserData(userId);
  }, [loadUserData]);

  const setActiveSiteId = useCallback((id: string) => {
    setActiveId(id);
    if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_SITE_KEY, id);
  }, []);

  const deleteSite = useCallback(async (siteId: string) => {
    const { error: err } = await supabase.from("sites").delete().eq("id", siteId);
    if (err) throw err;
    const remaining = memberships.filter((m) => m.site.id !== siteId);
    if (remaining.length > 0) {
      setActiveId(remaining[0].site.id);
      if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_SITE_KEY, remaining[0].site.id);
    } else {
      setActiveId(null);
      if (typeof localStorage !== "undefined") localStorage.removeItem(ACTIVE_SITE_KEY);
    }
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadUserData(data.user.id);
  }, [memberships, loadUserData, setActiveSiteId]);

  const activeMembership = memberships.find((m) => m.site.id === activeSiteId) ?? memberships[0] ?? null;

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadUserData(data.user.id);
  }, [loadUserData]);

  return (
    <AuthContext.Provider
      value={{
        ready,
        session,
        profile,
        memberships,
        activeSite: activeMembership?.site ?? null,
        activeRole: activeMembership?.role ?? null,
        canEdit: activeMembership?.role === "owner" || activeMembership?.role === "admin",
        signIn,
        signUp,
        signOut,
        createSite,
        deleteSite,
        setActiveSiteId,
        refresh,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
