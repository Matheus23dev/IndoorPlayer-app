import { create } from 'zustand';

type DeviceStore = {
  token?: string;

  setToken: (token: string) => void;

  logout: () => void;
};

export const useDeviceStore =
  create<DeviceStore>((set) => ({
    token: undefined,

    setToken: (token) =>
      set({ token }),

    logout: () =>
      set({ token: undefined }),
  }));