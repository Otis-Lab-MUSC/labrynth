#include "Lever.h" 
#include "Cue.h"
#include "Cue_Utils.h"
#include "Pump.h"   
#include "Pump_Utils.h"
#include "Laser.h"  
#include "Program_Utils.h"
#include <Arduino.h> 

extern unsigned long int timeoutIntervalStart;
extern unsigned long int timeoutIntervalEnd;
extern unsigned long int timeoutIntervalLength;
extern int pressCount;
extern int fRatio;
extern unsigned long int differenceFromStartTime;
extern Lever *activeLever;
extern Lever *inactiveLever;

void pressingDataEntry(Lever *&lever, Pump *pump) {
  String pressEntry;
  String infusionEntry;
  lever->setReleaseTimestamp(millis()); // sets press release timestamp
  pressEntry = lever->getOrientation() + "_LEVER,";
  pressEntry += lever->getPressType() + "_PRESS,";
  if (differenceFromStartTime)
  { // if program is started, the time stamp is adjusted to program start time (aka differenceFromStartTime)
    pressEntry += String(lever->getPressTimestamp() - differenceFromStartTime) + ",";
    pressEntry += String(lever->getReleaseTimestamp() - differenceFromStartTime);
  }
  else
  { // if program is not started, time stamp reflects time from Arduino start up
    pressEntry += String(lever->getPressTimestamp()) + ",";
    pressEntry += String(lever->getReleaseTimestamp());
  }
  Serial.println(pressEntry); // send data to serial connection
}

void definePressActivity(bool programRunning, Lever *&lever, Cue *cue, Pump *pump, Laser *laser) {
  long int timestamp = millis(); // captures initial timestamp
  if ((cue && cue->isArmed()) && (!pump || !pump->isArmed()))
  { // if the cue is armed and pump does not exists or the pump is not armed...
    if (timestamp >= cue->getOnTimestamp() && timestamp <= cue->getOffTimestamp() || timestamp >= timeoutIntervalStart && timestamp <= timeoutIntervalEnd)
    {
      lever->setPressType("TIMEOUT");
    } // if the press occurs during the cue tone period or timeout period, label 'TIMEOUT' and do not trigger another cue tone
    else
    { // if the press occurs outside of a cue tone, label 'ACTIVE' and trigger a cue
      lever->setPressType("ACTIVE");
      if (pressCount == fRatio - 1)
      {
        pressCount = 0;
        deliverReward(activeLever, cue, pump, laser);
        if (programRunning)
        {
          timeoutIntervalStart = cue->getOffTimestamp();
          timeoutIntervalEnd = timeoutIntervalStart + timeoutIntervalLength;
        }
      }
      else
      {
        pressCount ++;
      }
    }
  }
  else if ((cue && cue->isArmed()) && (pump && pump->isArmed()))
  { // if the cue is armed and pump exists and is also armed ...
    if (timestamp >= cue->getOnTimestamp() && timestamp <= pump->getInfusionEndTimestamp() || timestamp >= timeoutIntervalStart && timestamp <= timeoutIntervalEnd)
    {
      lever->setPressType("TIMEOUT");
    } // if the press occurs any time during the cue tone, trace interval, or infusion period, or timeout period label 'INACTIVE' and do not trigger new events
    else
    { // if it is a normal press, label 'ACTIVE' and trigger cue tone and pump infusion
      lever->setPressType("ACTIVE");
      if (pressCount == fRatio - 1)
      {
        pressCount = 0;
        deliverReward(activeLever, cue, pump, laser);
        String infusionEntry = "PUMP,INFUSION,";
        infusionEntry += differenceFromStartTime ? String(pump->getInfusionStartTimestamp() - differenceFromStartTime) : String(pump->getInfusionStartTimestamp());
        infusionEntry += ",";
        infusionEntry += differenceFromStartTime ? String(pump->getInfusionEndTimestamp() - differenceFromStartTime) : String(pump->getInfusionEndTimestamp());
        Serial.println(infusionEntry);
        if (programRunning)
        {
          timeoutIntervalStart = cue->getOffTimestamp();
          timeoutIntervalEnd = timeoutIntervalStart + timeoutIntervalLength;
        }
      }
      else
      {
        pressCount ++;
      }
    }
  }
  else
  {
    lever->setPressType("INACTIVE");
  } // if the lever is armed, but not paired with a cue or pump infusion, label as the default 'NO CONDITION'
}

void monitorPressing(bool programRunning, Lever *&lever, Cue *cue, Pump *pump, Laser *laser) {
  static unsigned long lastDebounceTime = 0; // stores the last time the lever input was toggled
  const unsigned long debounceDelay = 100;   // the debounce time; increase if the output flickers
  manageCue(cue);                       // manages cue delivery
  managePump(pump);                        // manages infusion delivery
  if (lever->isArmed())
  {
    bool currentLeverState = digitalRead(lever->getPin()); // reads the current state of the lever
    if (currentLeverState != lever->getPreviousLeverState())
    { // if the lever state has changed
      lastDebounceTime = millis(); // resets the debouncing timer
    }
    if ((millis() - lastDebounceTime) > debounceDelay)
    { // if the debounce period has passed, the lever's state is stable
      if (currentLeverState != lever->getStableLeverState())
      {
        lever->setStableLeverState(currentLeverState); // update the stable lever state
        if (currentLeverState == LOW)
        { // lever press detected (assuming LOW means pressed)
          lever->setPressTimestamp(millis());                    // set the press timestamp at the moment of detection
          definePressActivity(programRunning, lever, cue, pump, laser); // determine whether the press is active
        }
        else
        { // lever release detected
          lever->setReleaseTimestamp(millis()); // set the release timestamp at the moment of detection
          pressingDataEntry(lever, pump);       // handle data entry on lever release
        }
      }
    }
    lever->setPreviousLeverState(currentLeverState); // update the previous lever state for next iteration
  }
}
