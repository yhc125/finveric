import { useEffect, useState } from "react";

const dayMs = 86_400_000;
const offsetMs = 9 * 3_600_000;
const koreanDayStart = () =>
  Math.floor((Date.now() + offsetMs) / dayMs) * dayMs - offsetMs;

/** 열린 화면도 한국 시간 자정에 오늘의 집계를 갱신한다. */
export function useKoreanDay() {
  const [start, setStart] = useState(koreanDayStart);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const today = koreanDayStart();
      setStart(today);
      timer = setTimeout(update, today + dayMs - Date.now());
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return start / 1000;
}
