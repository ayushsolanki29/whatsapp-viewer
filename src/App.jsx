import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import JSZip from "jszip";

function App() {
  const [messages, setMessages] = useState([]);
  const [chatInfo, setChatInfo] = useState(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState(50);
  const [parsedLines, setParsedLines] = useState([]);
  const [mediaMap, setMediaMap] = useState(new Map());
  const chatContainerRef = useRef(null);

  // Parse WhatsApp exported lines incrementally
  const parseChatIncrementally = useCallback((text, mediaFiles = new Map()) => {
    setIsLoading(true);
    const lines = text.split("\n");
    const parsed = [];
    
    // Process first 1000 lines immediately for quick display
    const initialBatchSize = Math.min(1000, lines.length);
    
    // Extract media information from the chat to better match files
    const mediaMessages = [];
    
    for (let i = 0; i < initialBatchSize; i++) {
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
          // Store media message info for later matching
          mediaMessages.push({
            index: i,
            date: match[1],
            time: match[2],
            name: match[3],
            message: message,
            dateObj: new Date(`20${year}-${month}-${day}`),
            isMedia: true
          });
        } else {
          parsed.push({
            date: match[1],
            time: match[2],
            name: match[3],
            message: message,
            dateObj: new Date(`20${year}-${month}-${day}`),
            isMedia: false,
            mediaData: null
          });
        }
      }
    }
    
    // Now try to match media files with media messages
    const mediaEntries = Array.from(mediaFiles.entries());
    
    // First approach: try to match by date pattern (most reliable)
    const matchedMediaMessages = mediaMessages.map((msg, index) => {
      // WhatsApp media files typically follow patterns like:
      // IMG-YYYYMMDD-WAXXXX.jpg, VID-YYYYMMDD-WAXXXX.mp4, etc.
      const [day, month, year] = msg.date.split("/");
      const fullYear = `20${year}`;
      const datePattern1 = `-${fullYear}${month}${day}`;
      const datePattern2 = `${fullYear}${month}${day}`;
      
      // Try to find a matching media file
      let matchedFile = null;
      
      for (const [filename, url] of mediaEntries) {
        if (filename.includes(datePattern1) || filename.includes(datePattern2)) {
          matchedFile = { filename, url };
          break;
        }
      }
      
      // If not found by date, try to match by index (fallback)
      if (!matchedFile && index < mediaEntries.length) {
        matchedFile = {
          filename: mediaEntries[index][0],
          url: mediaEntries[index][1]
        };
      }
      
      return {
        ...msg,
        mediaData: matchedFile ? { 
          type: getMediaType(matchedFile.filename), 
          url: matchedFile.url,
          filename: matchedFile.filename
        } : null
      };
    });
    
    // Combine regular messages and media messages
    const allMessages = [...parsed, ...matchedMediaMessages];
    
    // Sort by date (since we processed them separately)
    allMessages.sort((a, b) => a.dateObj - b.dateObj);
    
    setParsedLines(lines);
    setMessages(allMessages);
    setMediaMap(mediaFiles);
    
    // Get chat info from the first and last valid messages
    if (allMessages.length > 0) {
      const names = [...new Set(allMessages.map((m) => m.name))];
      
      // Find the last message by checking from the end
      let lastMessage = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const match = line.match(
          /^(\d{2}\/\d{2}\/\d{2}),\s(.+?)\s-\s([^:]+):\s(.+)$/
        );
        if (match) {
          const [day, month, year] = match[1].split("/");
          lastMessage = {
            date: match[1],
            dateObj: new Date(`20${year}-${month}-${day}`),
          };
          break;
        }
      }
      
      setChatInfo({
        participants: names,
        totalMessages: lines.length,
        startDate: allMessages[0].date,
        endDate: lastMessage ? lastMessage.date : allMessages[0].date,
        mediaCount: Array.from(mediaFiles.keys()).length
      });
    }
    
    setIsLoading(false);
  }, []);

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
          parseChatIncrementally(chatText, mediaFiles);
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
      reader.onload = (event) => parseChatIncrementally(event.target.result);
      reader.readAsText(file);
    }
  };

  // Load more messages when scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (!chatContainerRef.current || isLoading) return;
      
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        setVisibleMessages(prev => {
          const newCount = prev + 50;
          if (newCount > messages.length && parsedLines.length > messages.length) {
            loadMoreMessages(messages.length, Math.min(messages.length + 1000, parsedLines.length));
          }
          return newCount;
        });
      }
    };

    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [isLoading, messages.length, parsedLines.length]);

  // Load more messages from the parsed lines
  const loadMoreMessages = useCallback((start, end) => {
    setIsLoading(true);
    
    setTimeout(() => {
      const newMessages = [];
      for (let i = start; i < end; i++) {
        const line = parsedLines[i];
        if (!line) continue;
        
        const match = line.match(
          /^(\d{2}\/\d{2}\/\d{2}),\s(.+?)\s-\s([^:]+):\s(.+)$/
        );
        if (match) {
          const [day, month, year] = match[1].split("/");
          let message = match[4];
          
          if (message.trim() === "<Media omitted>" || message.includes("media")) {
            // For media messages in additional batches, we'll use a simpler matching approach
            const mediaIndex = messages.filter(m => m.isMedia).length + newMessages.filter(m => m.isMedia).length;
            const mediaEntries = Array.from(mediaMap.entries());
            
            const mediaData = mediaIndex < mediaEntries.length ? { 
              type: getMediaType(mediaEntries[mediaIndex][0]), 
              url: mediaEntries[mediaIndex][1],
              filename: mediaEntries[mediaIndex][0]
            } : null;
            
            newMessages.push({
              date: match[1],
              time: match[2],
              name: match[3],
              message: message,
              dateObj: new Date(`20${year}-${month}-${day}`),
              isMedia: true,
              mediaData: mediaData
            });
          } else {
            newMessages.push({
              date: match[1],
              time: match[2],
              name: match[3],
              message: message,
              dateObj: new Date(`20${year}-${month}-${day}`),
              isMedia: false,
              mediaData: null
            });
          }
        }
      }
      
      setMessages(prev => [...prev, ...newMessages]);
      setIsLoading(false);
    }, 0);
  }, [parsedLines, mediaMap, messages]);

  // Apply filters (search + date range)
  const filteredMessages = useMemo(() => {
    let result = messages.slice(0, visibleMessages);

    if (search.trim()) {
      result = result.filter((m) =>
        m.message.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      result = result.filter((m) => m.dateObj >= fromDate);
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      result = result.filter((m) => m.dateObj <= toDate);
    }

    return result;
  }, [messages, search, dateFrom, dateTo, visibleMessages]);

  const resetFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
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
      {messages.length > 0 && (
        <div className="w-full max-w-md mt-4 space-y-3">
          <input
            type="text"
            placeholder="Search messages..."
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
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 focus:outline-none"
            />
          </div>

          <button
            onClick={resetFilters}
            className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Chat Window */}
      {isLoading && messages.length === 0 ? (
        <SkeletonLoader />
      ) : (
        <div 
          ref={chatContainerRef}
          className="w-full max-w-md bg-white rounded-2xl shadow-md p-4 mt-4 overflow-y-auto h-[70vh] border relative"
        >
          {filteredMessages.length === 0 ? (
            <p className="text-gray-500 text-center">No messages found</p>
          ) : (
            <>
              {filteredMessages.map((msg, index) => {
                const isMe = msg.name.includes("Ayush Solanki");

                return (
                  <div
                    key={index}
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
                        <p className="text-base">{msg.message}</p>
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
              {isLoading && (
                <div className="flex justify-center py-4">
                  <div className="animate-pulse text-gray-500">Loading more messages...</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;