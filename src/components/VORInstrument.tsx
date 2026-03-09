import React, { useMemo } from 'react';
import { motion } from 'motion/react';

interface VORInstrumentProps {
  obs: number;
  bearing: number; // Radial from station to aircraft
  distance: number; // DME in nautical miles
}

export const VORInstrument: React.FC<VORInstrumentProps> = ({ obs, bearing, distance }) => {
  // CDI Calculation
  // Difference between selected OBS and the current radial (bearing)
  // We want to know if we are on the radial.
  // If OBS is 360 and bearing is 010, we are 10 degrees right of course.
  
  const diff = useMemo(() => {
    let d = (bearing - obs + 540) % 360 - 180;
    return d;
  }, [obs, bearing]);

  // TO/FROM logic
  // If diff is between -90 and 90, it's FROM (flying away from station on that radial)
  // If diff is between 90 and 270 (or -90 to -270), it's TO
  const isFrom = Math.abs(diff) <= 90;
  const isTo = Math.abs(diff) > 90;

  // CDI needle deflection (max 10 degrees)
  // 1 dot = 2 degrees
  const cdiDeflection = Math.max(-10, Math.min(10, diff)) * (isTo ? -1 : 1);

  return (
    <div className="relative w-64 h-64 bg-[#1a1a1a] rounded-full border-4 border-[#333] shadow-2xl flex items-center justify-center overflow-hidden select-none">
      {/* Outer Compass Rose (Rotates with OBS) */}
      <motion.div 
        className="absolute inset-0 flex items-center justify-center"
        animate={{ rotate: -obs }}
        transition={{ type: 'spring', stiffness: 50, damping: 15 }}
      >
        {[...Array(36)].map((_, i) => {
          const angle = i * 10;
          const isMajor = i % 3 === 0;
          return (
            <div 
              key={i} 
              className="absolute h-full w-full flex flex-col items-center"
              style={{ transform: `rotate(${angle}deg)` }}
            >
              <div className={`w-0.5 ${isMajor ? 'h-4 bg-white' : 'h-2 bg-gray-500'}`} />
              {isMajor && (
                <span className="text-[10px] text-white font-bold mt-1">
                  {i === 0 ? 'N' : i === 9 ? 'E' : i === 18 ? 'S' : i === 27 ? 'W' : i}
                </span>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* Fixed Reference Mark (Top) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[12px] border-t-yellow-400 z-20" />

      {/* Center CDI Area */}
      <div className="relative w-40 h-40 rounded-full border border-[#444] flex items-center justify-center bg-[#111]">
        {/* Dots for CDI */}
        <div className="absolute flex gap-4 items-center">
          {[-10, -8, -6, -4, -2, 2, 4, 6, 8, 10].map(d => (
            <div key={d} className="w-1.5 h-1.5 rounded-full bg-gray-600" />
          ))}
        </div>
        <div className="absolute w-2 h-2 rounded-full bg-yellow-400 z-10" />

        {/* CDI Needle */}
        <motion.div 
          className="absolute w-1 h-32 bg-white z-20"
          animate={{ x: cdiDeflection * 4 }} // 4px per degree
          transition={{ type: 'spring', stiffness: 60, damping: 12 }}
        />

        {/* TO/FROM Indicator */}
        <div className="absolute top-8 flex flex-col items-center gap-1">
          <div className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] ${isTo ? 'border-b-white' : 'border-b-transparent'}`} />
          <span className="text-[8px] text-gray-400 font-mono">TO</span>
          <span className="text-[8px] text-gray-400 font-mono">FR</span>
          <div className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[10px] ${isFrom ? 'border-t-white' : 'border-t-transparent'}`} />
        </div>
      </div>

      {/* OBS Readout */}
      <div className="absolute bottom-4 bg-black/80 px-2 py-1 rounded border border-gray-700">
        <span className="text-yellow-400 font-mono text-xs">OBS {obs.toString().padStart(3, '0')}°</span>
      </div>

      {/* DME Readout */}
      <div className="absolute top-4 right-4 bg-black/80 px-2 py-1 rounded border border-gray-700">
        <span className="text-emerald-400 font-mono text-xs">{distance.toFixed(1)} NM</span>
      </div>
    </div>
  );
};
