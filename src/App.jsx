import { useState, useMemo, useRef, useCallback, useEffect } from "react";

function App() {
  const [messages, setMessages] = useState([]);
  const [chatInfo, setChatInfo] = useState(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState(50);
  const [parsedLines, setParsedLines] = useState([]);
  const chatContainerRef = useRef(null);

  // Parse WhatsApp exported lines incrementally
  const parseChatIncrementally = useCallback((text) => {
    setIsLoading(true);
    const lines = text.split("\n");
    const parsed = [];
    
    // Process first 1000 lines immediately for quick display
    const initialBatchSize = Math.min(1000, lines.length);
    
    for (let i = 0; i < initialBatchSize; i++) {
      const line = lines[i];
      const match = line.match(
        /^(\d{2}\/\d{2}\/\d{2}),\s(.+?)\s-\s([^:]+):\s(.+)$/
      );
      if (match) {
        const [day, month, year] = match[1].split("/");
        parsed.push({
          date: match[1], // dd/mm/yy
          time: match[2],
          name: match[3],
          message: match[4],
          dateObj: new Date(`20${year}-${month}-${day}`), // normalized Date
        });
      }
    }
    
    setParsedLines(lines);
    setMessages(parsed);
    
    // Get chat info from the first and last valid messages
    if (parsed.length > 0) {
      const names = [...new Set(parsed.map((m) => m.name))];
      
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
        totalMessages: lines.length, // This is an estimate
        startDate: parsed[0].date,
        endDate: lastMessage ? lastMessage.date : parsed[0].date,
      });
    }
    
    setIsLoading(false);
  }, []);

  // Load more messages when scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (!chatContainerRef.current || isLoading) return;
      
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        // Load more messages when near bottom
        setVisibleMessages(prev => {
          const newCount = prev + 50;
          // If we need to parse more lines to get more messages
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
    
    // Use setTimeout to avoid blocking the UI thread
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
          newMessages.push({
            date: match[1],
            time: match[2],
            name: match[3],
            message: match[4],
            dateObj: new Date(`20${year}-${month}-${day}`),
          });
        }
      }
      
      setMessages(prev => [...prev, ...newMessages]);
      setIsLoading(false);
    }, 0);
  }, [parsedLines]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => parseChatIncrementally(event.target.result);
    reader.readAsText(file);
  };

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
      <label className="cursor-pointer bg-blue-500 text-white px-4 py-2 rounded-full shadow hover:bg-blue-600 transition">
        Upload Chat File
        <input
          type="file"
          accept=".txt"
          onChange={handleFile}
          className="hidden"
        />
      </label>

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
                const isMedia = msg.message.trim() === "<Media omitted>";

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

                      {/* Message / Media Placeholder */}
                      {isMedia ? (
                        <div className="flex items-center gap-2 text-gray-500 italic">
                          <span>📎</span>
                          <span>Media File</span>
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