import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTutorialStore } from "../../store/useTutorialStore";
import { useNavigationStore } from "../../store/useNavigationStore";
import { useMeasureElement } from "../../hooks/useMeasureElement";
import { TutorialSpotlight } from "./TutorialSpotlight";
import { TutorialTooltip } from "./TutorialTooltip";

// Import tour registrations
import "./tours";

export function TutorialOverlay() {
  const active = useTutorialStore((s) => s.active);
  const currentStepIndex = useTutorialStore((s) => s.currentStepIndex);
  const steps = useTutorialStore((s) => s.steps);
  const nextStep = useTutorialStore((s) => s.nextStep);
  const prevStep = useTutorialStore((s) => s.prevStep);
  const goToStep = useTutorialStore((s) => s.goToStep);
  const skipTour = useTutorialStore((s) => s.skipTour);

  const step = steps[currentStepIndex] ?? null;
  const prevStepRef = useRef(currentStepIndex);

  // Navigate to the correct panel when step changes
  useEffect(() => {
    if (!active || !step) return;

    if (step.panel) {
      useNavigationStore.getState().setActivePanel(step.panel);
    }

    // Scroll target into view after a frame
    const raf = requestAnimationFrame(() => {
      if (step.target) {
        const el = document.querySelector(`[data-tour="${step.target}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    prevStepRef.current = currentStepIndex;
    return () => cancelAnimationFrame(raf);
  }, [active, currentStepIndex, step]);

  const selector = step?.target
    ? `[data-tour="${step.target}"]`
    : null;

  const rect = useMeasureElement(active ? selector : null);

  if (!active || !step) return null;

  return createPortal(
    <>
      <TutorialSpotlight rect={step.placement === "center" ? null : rect} visible interactive={step.interactive} />
      <TutorialTooltip
        step={step}
        stepIndex={currentStepIndex}
        totalSteps={steps.length}
        rect={step.placement === "center" ? null : rect}
        steps={steps}
        onNext={nextStep}
        onPrev={prevStep}
        onSkip={skipTour}
        onGoToStep={goToStep}
      />
    </>,
    document.body
  );
}
