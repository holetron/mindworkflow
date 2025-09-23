import { create } from 'zustand';
import {
  GlobalIntegration,
  fetchGlobalIntegrations,
  fetchGlobalIntegration,
  createGlobalIntegration,
  updateGlobalIntegration,
  deleteGlobalIntegration,
} from './api';

interface GlobalIntegrationsState {
  integrations: GlobalIntegration[];
  loading: boolean;
  error: string | null;
  fetchIntegrations: () => Promise<void>;
  addIntegration: (payload: Omit<GlobalIntegration, 'id' | 'createdAt' | 'updatedAt'>) => Promise<GlobalIntegration | undefined>;
  updateIntegration: (id: string, payload: Partial<Omit<GlobalIntegration, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<GlobalIntegration | undefined>;
  removeIntegration: (id: string) => Promise<void>;
}

export const useGlobalIntegrationsStore = create<GlobalIntegrationsState>((set, get) => ({
  integrations: [],
  loading: false,
  error: null,

  fetchIntegrations: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchGlobalIntegrations();
      set({ integrations: data, loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: `Failed to fetch integrations: ${message}`, loading: false });
    }
  },

  addIntegration: async (payload) => {
    set({ loading: true, error: null });
    try {
      const newIntegration = await createGlobalIntegration(payload);
      set((state) => ({
        integrations: [...state.integrations, newIntegration],
        loading: false,
      }));
      return newIntegration;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: `Failed to add integration: ${message}`, loading: false });
      return undefined;
    }
  },

  updateIntegration: async (id, payload) => {
    set({ loading: true, error: null });
    try {
      const updatedIntegration = await updateGlobalIntegration(id, payload);
      set((state) => ({
        integrations: state.integrations.map((integration) =>
          integration.id === id ? { ...integration, ...updatedIntegration } : integration
        ),
        loading: false,
      }));
      return updatedIntegration;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: `Failed to update integration: ${message}`, loading: false });
      return undefined;
    }
  },

  removeIntegration: async (id) => {
    set({ loading: true, error: null });
    try {
      await deleteGlobalIntegration(id);
      set((state) => ({
        integrations: state.integrations.filter((integration) => integration.id !== id),
        loading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: `Failed to delete integration: ${message}`, loading: false });
    }
  },
}));
