import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import JSZip from "jszip";
import Footer from "./components/Footer";

function App() {
  const [messages, setMessages] = useState([]);
  const [allMessages, setAllMessages] = useState([]); // Store all messages for filtering
  const [chatInfo, setChatInfo] = useState(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState(50);
  const [parsedLines, setParsedLines] = useState([]);
  const [mediaMap, setMediaMap] = useState(new Map());
  const [participantFilter, setParticipantFilter] = useState("");
  const chatContainerRef = useRef(null);

  // Parse WhatsApp exported lines
  const parseChat = useCallback((text, mediaFiles = new Map()) => {
    setIsLoading(true);
    const lines = text.split("\n");
    const parsed = [];
    
    // Extract all messages
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(
        /^(\d{2}\/\d{2}\/\d{2}),\s(.+?)\s-\s([^:]+):\s(.+)$/
      );
      if (match) {
        const [day, month, year] = match[1].split("/");
        let message = match[4];
        let mediaData = null;
        
        // Check if this is a media message
        if (message.trim() === "<Media omitted>" || message.includes("media")) {
          // WhatsApp media files typically follow patterns like:
          // IMG-YYYYMMDD-WAXXXX.jpg, VID-YYYYMMDD-WAXXXX.mp4, etc.
          const fullYear = `20${year}`;
          const datePattern1 = `-${fullYear}${month}${day}`;
          const datePattern2 = `${fullYear}${month}${day}`;
          
          // Try to find a matching media file
          let matchedFile = null;
          const mediaEntries = Array.from(mediaFiles.entries());
          
          for (const [filename, url] of mediaEntries) {
            if (filename.includes(datePattern1) || filename.includes(datePattern2)) {
              matchedFile = { filename, url };
              break;
            }
          }
          
          // If not found by date, try to match by index (fallback)
          if (!matchedFile) {
            const mediaIndex = parsed.filter(m => m.isMedia).length;
            if (mediaIndex < mediaEntries.length) {
              matchedFile = {
                filename: mediaEntries[mediaIndex][0],
                url: mediaEntries[mediaIndex][1]
              };
            }
          }
          
          mediaData = matchedFile ? { 
            type: getMediaType(matchedFile.filename), 
            url: matchedFile.url,
            filename: matchedFile.filename
          } : null;
        }
        
        parsed.push({
          date: match[1],
          time: match[2],
          name: match[3],
          message: message,
          dateObj: new Date(`20${year}-${month}-${day}`),
          isMedia: message.trim() === "<Media omitted>" || message.includes("media"),
          mediaData: mediaData,
          originalIndex: i // Store original index for reference
        });
      }
    }
    
    setParsedLines(lines);
    setAllMessages(parsed); // Store all messages
    setMessages(parsed.slice(0, visibleMessages)); // Show initial batch
    setMediaMap(mediaFiles);
    
    // Get chat info
    if (parsed.length > 0) {
      const names = [...new Set(parsed.map((m) => m.name))];
      
      setChatInfo({
        participants: names,
        totalMessages: parsed.length,
        startDate: parsed[0].date,
        endDate: parsed[parsed.length - 1].date,
        mediaCount: Array.from(mediaFiles.keys()).length
      });
    }
    
    setIsLoading(false);
  }, [visibleMessages]);

  // Determine media type from filename
  const getMediaType = (filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
      return 'image';
    } else if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(extension)) {
      return 'video';
    } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) {
      return 'audio';
    } else {
      return 'document';
    }
  };

  // Handle file upload - both txt and zip files
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsLoading(true);
    
    if (file.name.endsWith('.zip')) {
      // Handle ZIP file containing chat and media
      try {
        const zip = new JSZip();
        const contents = await zip.loadAsync(file);
        
        // Find the chat file (typically _chat.txt or similar)
        let chatFile = null;
        let mediaFiles = new Map();
        
        // First, find all media files
        const mediaFilePromises = [];
        
        for (const [filename, fileData] of Object.entries(contents.files)) {
          if (!fileData.dir) {
            if (filename.toLowerCase().includes('chat') && filename.endsWith('.txt')) {
              chatFile = fileData;
            } else if (filename.match(/\.(jpg|jpeg|png|gif|mp4|mov|avi|mp3|m4a|pdf|webp|mkv|ogg|wav)$/i)) {
              // Queue media file processing
              mediaFilePromises.push(
                fileData.async('blob').then(blob => {
                  const url = URL.createObjectURL(blob);
                  mediaFiles.set(filename, url);
                })
              );
            }
          }
        }
        
        // Wait for all media files to be processed
        await Promise.all(mediaFilePromises);
        
        if (chatFile) {
          const chatText = await chatFile.async('text');
          parseChat(chatText, mediaFiles);
        } else {
          alert('No chat file found in the ZIP archive. Look for a file containing "chat" in the name.');
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error processing ZIP file:', error);
        alert('Error processing ZIP file. Please make sure it is a valid WhatsApp export.');
        setIsLoading(false);
      }
    } else {
      // Handle regular text file
      const reader = new FileReader();
      reader.onload = (event) => parseChat(event.target.result);
      reader.readAsText(file);
    }
  };

  // -----------------------------------------------------------------------
  // THE FIX: Move this `useMemo` block up before the `useEffect` that uses it.
  // Apply filters (search + date range + participant)
  const filteredMessages = useMemo(() => {
    if (!allMessages.length) return [];
    
    let result = [...allMessages];

    // Apply search filter
    if (search.trim()) {
      const searchTerm = search.toLowerCase();
      result = result.filter((m) =>
        m.message.toLowerCase().includes(searchTerm) ||
        m.name.toLowerCase().includes(searchTerm)
      );
    }

    // Apply date filters
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      result = result.filter((m) => m.dateObj >= fromDate);
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999); // Include entire end day
      result = result.filter((m) => m.dateObj <= toDate);
    }

    // Apply participant filter
    if (participantFilter) {
      result = result.filter((m) => 
        m.name.toLowerCase() === participantFilter.toLowerCase()
      );
    }

    return result;
  }, [allMessages, search, dateFrom, dateTo, participantFilter]);
  // -----------------------------------------------------------------------

  // Load more messages when scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (!chatContainerRef.current || isLoading) return;
      
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        setVisibleMessages(prev => {
          const newCount = Math.min(prev + 50, filteredMessages.length);
          return newCount;
        });
      }
    };

    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [isLoading, filteredMessages.length]);

  // Update visible messages when filters change
  useEffect(() => {
    setMessages(filteredMessages.slice(0, visibleMessages));
  }, [filteredMessages, visibleMessages]);

  const resetFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setParticipantFilter("");
    setVisibleMessages(50);
  };

  // Clean up object URLs when component unmounts
  useEffect(() => {
    return () => {
      for (const url of mediaMap.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [mediaMap]);

  // Media renderer component
  const MediaRenderer = ({ mediaData }) => {
    if (!mediaData) {
      return (
        <div className="flex items-center gap-2 text-gray-500 italic">
          <span>📎</span>
          <span>Media not available</span>
        </div>
      );
    }

    switch (mediaData.type) {
      case 'image':
        return (
          <div className="max-w-xs">
            <img 
              src={mediaData.url} 
              alt="Shared media" 
              className="max-w-full rounded-lg cursor-pointer"
              onClick={() => window.open(mediaData.url, '_blank')}
            />
            <p className="text-xs text-gray-500 mt-1 truncate">{mediaData.filename}</p>
          </div>
        );
      case 'video':
        return (
          <div className="max-w-xs">
            <video controls className="max-w-full rounded-lg">
              <source src={mediaData.url} type={`video/${mediaData.filename.split('.').pop()}`} />
              Your browser does not support the video tag.
            </video>
            <p className="text-xs text-gray-500 mt-1 truncate">{mediaData.filename}</p>
          </div>
        );
      case 'audio':
        return (
          <div className="max-w-xs">
            <audio controls className="w-full">
              <source src={mediaData.url} type={`audio/${mediaData.filename.split('.').pop()}`} />
              Your browser does not support the audio element.
            </audio>
            <p className="text-xs text-gray-500 mt-1 truncate">{mediaData.filename}</p>
          </div>
        );
      default:
        return (
          <a 
            href={mediaData.url} 
            download={mediaData.filename}
            className="flex items-center gap-2 text-blue-500 underline"
          >
            <span>📎</span>
            <span>Download {mediaData.filename}</span>
          </a>
        );
    }
  };

  // Message preview component
  const MessagePreview = ({ message, searchTerm }) => {
    if (!searchTerm) return <p className="text-base">{message}</p>;
    
    const index = message.toLowerCase().indexOf(searchTerm.toLowerCase());
    if (index === -1) return <p className="text-base">{message}</p>;
    
    const before = message.substring(0, index);
    const match = message.substring(index, index + searchTerm.length);
    const after = message.substring(index + searchTerm.length);
    
    return (
      <p className="text-base">
        {before}
        <span className="bg-yellow-300 font-semibold">{match}</span>
        {after}
      </p>
    );
  };

  // Skeleton loader component
  const SkeletonLoader = () => (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-4 mt-4 overflow-y-auto h-[70vh] border relative">
      {Array.from({ length: 15 }).map((_, index) => (
        <div key={index} className={`mb-4 flex ${index % 3 === 0 ? "justify-end" : "justify-start"}`}>
          <div className={`relative max-w-[75%] px-4 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap
            ${index % 3 === 0 ? "bg-gray-300" : "bg-gray-200"}`}>
            {index % 3 !== 0 && (
              <div className="h-3 w-20 bg-gray-400 rounded mb-2"></div>
            )}
            <div className="h-4 w-full bg-gray-400 rounded mb-2"></div>
            <div className="h-4 w-3/4 bg-gray-400 rounded"></div>
            <div className="flex justify-end mt-2">
              <div className="h-2 w-10 bg-gray-400 rounded"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 font-sans">
      {/* App Header */}
      <h1 className="text-2xl font-bold mb-4 text-gray-800">
        WhatsApp Chat Viewer
      </h1>

      {/* File Upload */}
      <div className="flex flex-col items-center gap-2">
        <label className="cursor-pointer bg-blue-500 text-white px-4 py-2 rounded-full shadow hover:bg-blue-600 transition">
          Upload Chat File (TXT or ZIP)
          <input
            type="file"
            accept=".txt,.zip"
            onChange={handleFile}
            className="hidden"
          />
        </label>
        <p className="text-xs text-gray-600">Upload a TXT file or ZIP export from WhatsApp</p>
      </div>

      {/* Chat Info Card */}
      {chatInfo && (
        <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-4 mt-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Chat Summary
          </h2>
          <p className="text-sm text-gray-600">
            <span className="font-semibold">Participants:</span>{" "}
            {chatInfo.participants.join(" & ")}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-semibold">Total Messages:</span>{" "}
            {chatInfo.totalMessages.toLocaleString()}
          </p>
          {chatInfo.mediaCount > 0 && (
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Media Files:</span>{" "}
              {chatInfo.mediaCount}
            </p>
          )}
          <p className="text-sm text-gray-600">
            <span className="font-semibold">From:</span> {chatInfo.startDate} →{" "}
            <span className="font-semibold">To:</span> {chatInfo.endDate}
          </p>
        </div>
      )}

      {/* Search + Filters */}
      {allMessages.length > 0 && (
        <div className="w-full max-w-md mt-4 space-y-3">
          <input
            type="text"
            placeholder="Search messages or names..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 rounded-full border border-gray-300 focus:ring-2 focus:ring-blue-400 focus:outline-none"
          />

          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 focus:outline-none"
              placeholder="From date"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 focus:outline-none"
              placeholder="To date"
            />
          </div>

          {chatInfo && chatInfo.participants.length > 1 && (
            <select
              value={participantFilter}
              onChange={(e) => setParticipantFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 focus:outline-none"
            >
              <option value="">All participants</option>
              {chatInfo.participants.map((participant, index) => (
                <option key={index} value={participant}>
                  {participant}
                </option>
              ))}
            </select>
          )}

          <div className="flex gap-2">
            <button
              onClick={resetFilters}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
            >
              Reset Filters
            </button>
            <div className="flex-1 bg-blue-100 text-blue-700 py-2 rounded-lg text-center">
              Showing: {filteredMessages.length} of {allMessages.length}
            </div>
          </div>
        </div>
      )}

      {/* Chat Window */}
      {isLoading && allMessages.length === 0 ? (
        <SkeletonLoader />
      ) : (
        <div 
          ref={chatContainerRef}
          className="w-full max-w-md bg-white rounded-2xl shadow-md p-4 mt-4 overflow-y-auto h-[70vh] border relative"
        >
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center">
              {allMessages.length > 0 ? "No messages match your filters" : "Upload a chat file to begin"}
            </p>
          ) : (
            <>
              {messages.map((msg, index) => {
                const isMe = msg.name.includes("Ayush Solanki");

                return (
                  <div
                    key={`${msg.originalIndex}-${index}`}
                    className={`mb-4 flex ${
                      isMe ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`relative max-w-[75%] px-4 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap
                        ${
                          isMe
                            ? "bg-blue-500 text-white rounded-br-none"
                            : "bg-gray-200 text-gray-900 rounded-bl-none"
                        }`}
                    >
                      {/* Show sender name only if not me */}
                      {!isMe && (
                        <p className="font-semibold text-blue-600 text-xs mb-1">
                          {msg.name}
                        </p>
                      )}

                      {/* Message / Media */}
                      {msg.isMedia ? (
                        <div className="max-w-xs">
                          <MediaRenderer mediaData={msg.mediaData} />
                        </div>
                      ) : (
                        <MessagePreview message={msg.message} searchTerm={search} />
                      )}

                      {/* Timestamp */}
                      <div className="flex justify-end items-center gap-1">
                        <p
                          className={`text-[10px] mt-1 text-right ${
                            isMe ? "text-blue-100" : "text-gray-500"
                          }`}
                        >
                          {msg.date}
                        </p>
                        <p
                          className={`text-[10px] mt-1 text-right ${
                            isMe ? "text-blue-100" : "text-gray-500"
                          }`}
                        >
                          {msg.time}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {visibleMessages < filteredMessages.length && (
                <div className="flex justify-center py-4">
                  <button 
                    onClick={() => setVisibleMessages(prev => Math.min(prev + 50, filteredMessages.length))}
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition"
                  >
                    Load more messages ({filteredMessages.length - visibleMessages} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
<Footer />
    </div>
  );
}

export default App;