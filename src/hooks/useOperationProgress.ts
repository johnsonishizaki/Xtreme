import { useState, useRef, useCallback, useEffect } from 'react';
import { ProgressStage } from '../components/OperationProgressModal';

export interface UseOperationProgressOptions {
  autoTick?: boolean;
}

export function useOperationProgress(options: UseOperationProgressOptions = { autoTick: true }) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stages, setStages] = useState<ProgressStage[]>([]);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const progressSimRef = useRef<any>(null);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressSimRef.current) clearInterval(progressSimRef.current);
    };
  }, []);

  const startOperation = useCallback(
    (opTitle: string, stageList: (string | ProgressStage)[], opDescription?: string) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressSimRef.current) clearInterval(progressSimRef.current);

      const normalizedStages: ProgressStage[] = stageList.map(s =>
        typeof s === 'string' ? { label: s } : s
      );

      setTitle(opTitle);
      setDescription(opDescription || 'Working in background — extracting details...');
      setStages(normalizedStages);
      setCurrentStageIndex(0);
      setProgressPercent(12);
      setElapsedMs(0);
      setIsCompleted(false);
      setErrorMessage(null);
      setIsOpen(true);

      const startTime = Date.now();
      startTimeRef.current = startTime;

      // Elapsed time ticker (updates every 100ms for smooth live feedback)
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTime);
      }, 100);

      // Smooth realistic progress simulator while waiting on heavy network/AI response
      if (options.autoTick) {
        progressSimRef.current = setInterval(() => {
          setProgressPercent(prev => {
            if (prev >= 92) return prev; // Hold at 92% until true completion
            const increment = prev < 50 ? 5 : prev < 75 ? 3 : 1;
            return Math.min(92, prev + increment);
          });
        }, 400);
      }
    },
    [options.autoTick]
  );

  const setStage = useCallback((index: number, detail?: string, percent?: number) => {
    setCurrentStageIndex(index);
    if (detail !== undefined) {
      setStages(prev => {
        const next = [...prev];
        if (next[index]) {
          next[index] = { ...next[index], detail };
        }
        return next;
      });
    }
    if (percent !== undefined) {
      setProgressPercent(percent);
    }
  }, []);

  const setDetail = useCallback((detail: string) => {
    setStages(prev => {
      const next = [...prev];
      if (next[currentStageIndex]) {
        next[currentStageIndex] = { ...next[currentStageIndex], detail };
      }
      return next;
    });
  }, [currentStageIndex]);

  const completeOperation = useCallback((finalMessage?: string, delayCloseMs = 600): Promise<void> => {
    if (progressSimRef.current) clearInterval(progressSimRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    setProgressPercent(100);
    setIsCompleted(true);
    if (finalMessage) {
      setDescription(finalMessage);
    }

    return new Promise(resolve => {
      setTimeout(() => {
        setIsOpen(false);
        resolve();
      }, delayCloseMs);
    });
  }, []);

  const failOperation = useCallback((error: string) => {
    if (progressSimRef.current) clearInterval(progressSimRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    setErrorMessage(error);
  }, []);

  const close = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (progressSimRef.current) clearInterval(progressSimRef.current);
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    title,
    description,
    stages,
    currentStageIndex,
    progressPercent,
    elapsedMs,
    isCompleted,
    errorMessage,
    startOperation,
    setStage,
    setDetail,
    setProgressPercent,
    completeOperation,
    failOperation,
    close
  };
}
