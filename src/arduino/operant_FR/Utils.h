#ifndef UTILS_H
#define UTILS_H

#include <Arduino.h> 

void pingDevice(unsigned long &previousPing, const unsigned long pingInterval); // sends '200' byte line through Serial to ensure connection is OK
void frameSignalISR();
void handleFrameSignal();

#endif
