"use client";

import { createContext, useContext } from "react";

/**
 * 셸이 지금 화면에 대해 아는 것 중, 페이지 안쪽에서도 알아야 하는 것.
 *
 * 지금은 하나뿐이다: 폰 상단바가 이미 이 페이지의 이모지·제목을 띄웠는가.
 * 띄웠다면 `PageHeader` 는 폰에서 제목 블록을 접고 액션만 남긴다 —
 * 그러지 않으면 같은 제목이 위아래로 두 번 나온다.
 */
export interface ShellState {
  /** 폰 상단바가 현재 페이지 제목을 이미 보여주는 중 */
  titleInTopBar: boolean;
}

const ShellContext = createContext<ShellState>({ titleInTopBar: false });

export const ShellProvider = ShellContext.Provider;

export function useShell(): ShellState {
  return useContext(ShellContext);
}
