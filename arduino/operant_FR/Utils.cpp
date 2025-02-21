#include "Utils.h"
#include <Arduino.h> 

extern bool frameSignalReceived;
extern bool collectFrames;
extern unsigned long int frameSignalTimestamp;
extern unsigned long int differenceFromStartTime;

void pingDevice(unsigned long &previousPing, const unsigned long pingInterval) {
  unsigned long currentMillis = millis();
  if (currentMillis - previousPing >= pingInterval) {
    previousPing = currentMillis;
    byte ping = 200;
    Serial.println(ping);
  }
}

void frameSignalISR() {
  frameSignalReceived = true;
  frameSignalTimestamp = millis() - differenceFromStartTime; // capture the timestamp, adjusted by differenceFromStartTime
}

void handleFrameSignal() {
  if (collectFrames)
  {
    if (frameSignalReceived)
    {
      noInterrupts(); // temporarily disable interrupts to safely access shared variables
      frameSignalReceived = false;
      long int timestamp = frameSignalTimestamp;
      interrupts(); // re-enable interrupts
      Serial.println("FRAME_TIMESTAMP," + String(timestamp));
    }
  }
}
