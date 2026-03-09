import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Plane, Navigation, Settings, Compass, Info, ChevronRight, ChevronLeft, Locate, Download, Trash2, History } from 'lucide-react';
import { HSIInstrument } from './components/HSIInstrument';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Knob = ({ children, value, onChange }: { children: React.ReactNode, value: number, onChange: (delta: number) => void }) => {
  return (
    <div className="relative group">
      {/* Knob Body */}
      <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#444] to-[#111] border-2 border-[#555] shadow-2xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform relative overflow-hidden">
        {/* Grip Texture */}
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-conic-gradient(#000 0 10deg, transparent 10deg 20deg)' }} />
        
        {/* Indicator Line */}
        <div 
          className="absolute w-1 h-5 bg-white/40 rounded-full top-1" 
          style={{ transform: `rotate(${value}deg)`, transformOrigin: 'center 24px' }} 
        />

        {/* Internal Content */}
        <div className="z-10 flex flex-col items-center">
          {children}
        </div>

        {/* Center Cap Decoration */}
        <div className="absolute inset-0 rounded-full border border-white/5 pointer-events-none" />
      </div>
      
      {/* Interaction Areas */}
      <div className="absolute inset-0 flex z-20">
        <button 
          onClick={() => onChange(-1)}
          className="flex-1 h-full rounded-l-full"
        />
        <button 
          onClick={() => onChange(1)}
          className="flex-1 h-full rounded-r-full"
        />
      </div>
    </div>
  );
};

// Haversine formula to calculate distance in Meters
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000; // Radius of Earth in Meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Calculate bearing between two points
const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const λ1 = lon1 * Math.PI / 180;
  const λ2 = lon2 * Math.PI / 180;

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
};

interface TrackingPoint {
  timestamp: string;
  lat: number;
  lng: number;
  radial: number;
  distance: number;
  heading: number;
  obs: number;
}

export default function App() {
  // VOR Station Coordinates (Default: Suvarnabhumi Airport VOR 'BKK' 13.6811, 100.7473)
  const [station, setStation] = useState({ lat: 13.6811, lng: 100.7473 });
  const [aircraft, setAircraft] = useState({ lat: 13.9126, lng: 100.6067 }); // Don Mueang as default aircraft pos
  const [obs, setObs] = useState(0);
  const [heading, setHeading] = useState(0);
  const [headingBug, setHeadingBug] = useState(0);
  const [isTracking, setIsTracking] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [trackingLog, setTrackingLog] = useState<TrackingPoint[]>([]);
  const [showLog, setShowLog] = useState(false);

  // Refs for values used in the tracking callback to avoid effect restarts
  const stationRef = useRef(station);
  const headingRef = useRef(heading);
  const obsRef = useRef(obs);

  useEffect(() => { stationRef.current = station; }, [station]);
  useEffect(() => { headingRef.current = heading; }, [heading]);
  useEffect(() => { obsRef.current = obs; }, [obs]);

  // Derived values
  const radial = calculateBearing(station.lat, station.lng, aircraft.lat, aircraft.lng);
  const distance = calculateDistance(station.lat, station.lng, aircraft.lat, aircraft.lng);

  // GPS Sampling and Averaging
  const gpsSamples = useRef<{lat: number, lng: number}[]>([]);
  
  // Geolocation tracking
  useEffect(() => {
    let intervalId: number;
    let tickCount = 0;
    
    const samplePosition = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            gpsSamples.current.push({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            });
            
            tickCount++;
            
            // Every 5 samples (approx 5 seconds if interval is 1s)
            if (tickCount >= 5) {
              if (gpsSamples.current.length > 0) {
                const avgLat = gpsSamples.current.reduce((sum, s) => sum + s.lat, 0) / gpsSamples.current.length;
                const avgLng = gpsSamples.current.reduce((sum, s) => sum + s.lng, 0) / gpsSamples.current.length;
                
                const newPos = { lat: avgLat, lng: avgLng };
                setAircraft(newPos);
                
                // Auto-log the averaged position
                const now = new Date();
                setTrackingLog(prev => {
                  return [...prev, {
                    timestamp: now.toISOString(),
                    lat: newPos.lat,
                    lng: newPos.lng,
                    radial: calculateBearing(stationRef.current.lat, stationRef.current.lng, newPos.lat, newPos.lng),
                    distance: calculateDistance(stationRef.current.lat, stationRef.current.lng, newPos.lat, newPos.lng),
                    heading: headingRef.current,
                    obs: obsRef.current
                  }];
                });
              }
              
              // Reset for next window
              gpsSamples.current = [];
              tickCount = 0;
            }
          },
          (err) => {
            console.error("GPS Error:", err);
          },
          { 
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
          }
        );
      }
    };

    if (isTracking) {
      // Sample every 1 second
      intervalId = window.setInterval(samplePosition, 1000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isTracking]); // Only restart if tracking is toggled

  const [compassPermission, setCompassPermission] = useState<boolean | null>(null);

  const requestCompassPermission = async () => {
    // @ts-ignore
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        // @ts-ignore
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          setCompassPermission(true);
        } else {
          setCompassPermission(false);
        }
      } catch (e) {
        console.error(e);
        setCompassPermission(false);
      }
    } else {
      setCompassPermission(true);
    }
  };

  // Compass heading from device
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      // @ts-ignore
      if (e.webkitCompassHeading !== undefined) {
        // @ts-ignore
        setHeading(e.webkitCompassHeading);
      } else if (e.alpha !== null) {
        setHeading(360 - (e.alpha || 0));
      }
    };

    if (isTracking && compassPermission) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, [isTracking, compassPermission]);

  const handleObsChange = (delta: number) => {
    setObs(prev => (prev + delta + 360) % 360);
  };

  const handleHeadingBugChange = (delta: number) => {
    setHeadingBug(prev => (prev + delta + 360) % 360);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('SkyNav HSI Tracking Report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Station: ${station.lat.toFixed(10)}, ${station.lng.toFixed(10)}`, 14, 35);

    const tableData = trackingLog.map(p => [
      new Date(p.timestamp).toLocaleTimeString(),
      p.lat.toFixed(10),
      p.lng.toFixed(10),
      `${Math.round(p.radial)}°`,
      `${Math.round(p.distance)} m`,
      `${Math.round(p.heading)}°`,
      `${Math.round(p.obs)}°`
    ]);

    doc.autoTable({
      startY: 40,
      head: [['Time', 'Lat', 'Lng', 'Radial', 'DME', 'HDG', 'OBS']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255] }
    });

    doc.save(`SkyNav_Tracking_${new Date().getTime()}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-yellow-400/30 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-white/10 flex items-center justify-between bg-[#111] z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-yellow-400 rounded flex items-center justify-center">
            <Navigation className="text-black w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase">SkyNav HSI Simulator</h1>
            <p className="text-[10px] text-gray-500 font-mono">VOR VTBH 117.70 MHz by Lt.Col.SAKKARIN JORNSRI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowLog(true)}
            className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors relative"
          >
            <History className="w-5 h-5" />
            {trackingLog.length > 0 && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-yellow-400 rounded-full" />
            )}
          </button>
          <button 
            onClick={() => {
              if (!compassPermission) {
                requestCompassPermission();
              }
              setIsTracking(!isTracking);
            }}
            className={cn(
              "p-2 rounded-full transition-colors",
              isTracking ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-gray-400"
            )}
          >
            <Locate className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Display */}
      <main className="flex-1 relative flex flex-col items-center justify-center p-6 gap-6">
        {/* Background Grid */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* HSI Instrument Container */}
        <div className="relative group">
          {/* External Readouts */}
          <div className="absolute -top-8 -left-8 z-20 bg-black/90 px-3 py-1.5 rounded-xl border border-orange-500/30 shadow-2xl backdrop-blur-md">
            <div className="text-[10px] text-gray-500 uppercase font-bold mb-0.5">Heading</div>
            <div className="text-xl font-mono font-bold text-orange-500 leading-none">
              {Math.round(heading).toString().padStart(3, '0')}°
            </div>
          </div>
          
          <div className="absolute -top-8 -right-8 z-20 bg-black/90 px-3 py-1.5 rounded-xl border border-yellow-400/30 shadow-2xl backdrop-blur-md">
            <div className="text-[10px] text-gray-500 uppercase font-bold mb-0.5 text-right">OBS</div>
            <div className="text-xl font-mono font-bold text-yellow-400 leading-none">
              {obs.toString().padStart(3, '0')}°
            </div>
          </div>

          <div className="absolute -inset-4 bg-yellow-400/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          <HSIInstrument obs={obs} bearing={radial} distance={distance} heading={heading} headingBug={headingBug} />
          
          {/* Knobs */}
          <div className="absolute -bottom-6 -left-6 z-30">
            <Knob value={obs} onChange={handleObsChange}>
              <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center border border-white/20 shadow-inner">
                <span className="text-[11px] font-black text-white tracking-tight">OBS</span>
              </div>
            </Knob>
          </div>
          <div className="absolute -bottom-6 -right-6 z-30">
            <Knob value={headingBug} onChange={handleHeadingBugChange}>
              <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center border border-white/20 shadow-inner">
                <svg width="20" height="16" viewBox="0 0 24 20" fill="none" stroke="#f97316" strokeWidth="2.5">
                  <path d="M2 2h20v12h-7l-3 4-3-4H2V2z" strokeLinejoin="round" />
                </svg>
              </div>
            </Knob>
          </div>
        </div>

        {/* Spacing spacer */}
        <div className="h-2" />

        {/* Real-time Data Cards */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          <div className="bg-[#111] p-4 rounded-2xl border border-white/5">
            <div className="flex items-center gap-2 mb-1">
              <Compass className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-gray-500 uppercase font-bold">Radial</span>
            </div>
            <p className="text-2xl font-mono font-bold">{Math.round(radial).toString().padStart(3, '0')}°</p>
          </div>
          <div className="bg-[#111] p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 shadow-lg shadow-emerald-500/5">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-gray-500 uppercase font-bold">DME (Meters)</span>
            </div>
            <p className="text-2xl font-mono font-bold text-emerald-400">
              {Math.round(distance).toString().padStart(3, '0')}
            </p>
          </div>
          
          {/* Station Coordinates */}
          <div className="col-span-2 bg-[#111] p-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Navigation className="w-3 h-3 text-yellow-400" />
                <span className="text-[10px] text-gray-500 uppercase font-bold">VOR Station Reference</span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setStation({ lat: aircraft.lat, lng: aircraft.lng });
                    const btn = document.getElementById('set-station-btn');
                    if (btn) {
                      const originalText = btn.innerText;
                      btn.innerText = 'STATION SET!';
                      btn.classList.add('bg-emerald-500');
                      btn.classList.remove('bg-yellow-400');
                      setTimeout(() => {
                        btn.innerText = originalText;
                        btn.classList.remove('bg-emerald-500');
                        btn.classList.add('bg-yellow-400');
                      }, 2000);
                    }
                  }}
                  id="set-station-btn"
                  className="text-[10px] bg-yellow-400 text-black px-3 py-1 rounded-full font-bold hover:bg-yellow-300 transition-all shadow-lg shadow-yellow-400/20 active:scale-95"
                >
                  SET STATION TO HERE
                </button>
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-1 hover:bg-white/5 rounded text-gray-500 hover:text-white transition-colors"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-sm font-mono font-bold text-yellow-400/80">
              {station.lat.toFixed(10)}, {station.lng.toFixed(10)}
            </p>
          </div>

          {/* Aircraft Coordinates */}
          <div className="col-span-2 bg-[#111] p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Plane className={cn("w-3 h-3", isTracking ? "text-emerald-400" : "text-gray-500")} />
                <span className="text-[10px] text-gray-500 uppercase font-bold">Current Aircraft Position</span>
              </div>
              {isTracking && <span className="text-[8px] bg-emerald-500 text-black px-1 rounded font-bold animate-pulse">GPS LIVE</span>}
            </div>
            <div className="flex justify-between items-center">
              <p className="text-lg font-mono font-bold text-emerald-400">
                {aircraft.lat.toFixed(10)}, {aircraft.lng.toFixed(10)}
              </p>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${aircraft.lat}, ${aircraft.lng}`);
                }}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors"
                title="Copy Coordinates"
              >
                <Download className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Drawer */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute bottom-0 left-0 right-0 bg-[#111] border-t border-white/10 rounded-t-[32px] p-8 z-50 max-h-[80vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />
              
              <div className="space-y-8">
                <section>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
                    <Compass className="w-4 h-4" /> Manual Heading Override
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Current Heading</span>
                      <span className="text-sm font-mono font-bold text-orange-500">{Math.round(heading)}°</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="359" 
                      value={heading}
                      onChange={(e) => setHeading(parseInt(e.target.value))}
                      className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                    <p className="text-[10px] text-gray-600 italic">Note: Manual adjustment will be overridden if GPS/Compass tracking is active and moving.</p>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> VOR Station Coordinates
                    </div>
                    <button 
                      onClick={() => setStation({ lat: aircraft.lat, lng: aircraft.lng })}
                      className="text-[10px] bg-white/5 px-2 py-1 rounded hover:bg-white/10 transition-colors"
                    >
                      Set to Current Pos
                    </button>
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs text-gray-400">Latitude</label>
                      <input 
                        type="number" 
                        value={station.lat}
                        onChange={(e) => setStation(s => ({ ...s, lat: parseFloat(e.target.value) }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 font-mono text-sm focus:border-yellow-400 outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-400">Longitude</label>
                      <input 
                        type="number" 
                        value={station.lng}
                        onChange={(e) => setStation(s => ({ ...s, lng: parseFloat(e.target.value) }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 font-mono text-sm focus:border-yellow-400 outline-none transition-colors"
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
                    <Plane className="w-4 h-4" /> Aircraft Position (Manual)
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs text-gray-400">Latitude</label>
                      <input 
                        type="number" 
                        disabled={isTracking}
                        value={aircraft.lat}
                        onChange={(e) => setAircraft(s => ({ ...s, lat: parseFloat(e.target.value) }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 font-mono text-sm focus:border-yellow-400 outline-none transition-colors disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-400">Longitude</label>
                      <input 
                        type="number" 
                        disabled={isTracking}
                        value={aircraft.lng}
                        onChange={(e) => setAircraft(s => ({ ...s, lng: parseFloat(e.target.value) }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 font-mono text-sm focus:border-yellow-400 outline-none transition-colors disabled:opacity-50"
                      />
                    </div>
                  </div>
                </section>

                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full bg-yellow-400 text-black font-bold py-4 rounded-2xl hover:bg-yellow-300 active:scale-[0.98] transition-all"
                >
                  Apply & Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Log Drawer */}
      <AnimatePresence>
        {showLog && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLog(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="absolute top-0 right-0 bottom-0 w-full max-w-md bg-[#111] border-l border-white/10 p-6 z-50 flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <History className="w-5 h-5 text-yellow-400" /> Tracking Log
                </h2>
                <button onClick={() => setShowLog(false)} className="p-2 hover:bg-white/5 rounded-full">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 mb-6">
                {trackingLog.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
                    <History className="w-12 h-12 opacity-20" />
                    <p>No tracking data yet.</p>
                  </div>
                ) : (
                  trackingLog.slice().reverse().map((p, i) => (
                    <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5 text-[10px] font-mono">
                      <div className="flex justify-between text-gray-400 mb-1">
                        <span>{new Date(p.timestamp).toLocaleTimeString()}</span>
                        <span className="text-emerald-400">{Math.round(p.distance)} m</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>RAD: {Math.round(p.radial)}°</div>
                        <div>HDG: {Math.round(p.heading)}°</div>
                        <div>LAT: {p.lat.toFixed(10)}</div>
                        <div>LNG: {p.lng.toFixed(10)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setTrackingLog([])}
                  className="flex items-center justify-center gap-2 bg-red-500/10 text-red-400 py-3 rounded-xl hover:bg-red-500/20 transition-all"
                >
                  <Trash2 className="w-4 h-4" /> Clear
                </button>
                <button 
                  disabled={trackingLog.length === 0}
                  onClick={generatePDF}
                  className="flex items-center justify-center gap-2 bg-yellow-400 text-black font-bold py-3 rounded-xl hover:bg-yellow-300 disabled:opacity-50 transition-all"
                >
                  <Download className="w-4 h-4" /> PDF Report
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Footer Status */}
      <footer className="p-3 bg-black border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-gray-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <div className={cn("w-1.5 h-1.5 rounded-full", isTracking ? "bg-emerald-500 animate-pulse" : "bg-gray-700")} />
            GPS: {isTracking ? 'ACTIVE' : 'OFFLINE'}
          </span>
          <span className="flex items-center gap-1">
            <div className={cn("w-1.5 h-1.5 rounded-full", compassPermission === true ? "bg-orange-500" : compassPermission === false ? "bg-red-500" : "bg-gray-700")} />
            COMPASS: {compassPermission === true ? 'ACTIVE' : compassPermission === false ? 'DENIED' : 'WAITING'}
          </span>
          <span>LAT: {aircraft.lat.toFixed(10)}</span>
          <span>LNG: {aircraft.lng.toFixed(10)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Info className="w-3 h-3" />
          <span>HSI MODE</span>
        </div>
      </footer>
    </div>
  );
}
