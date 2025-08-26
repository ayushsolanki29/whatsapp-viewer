import { useState, useMemo } from "react";

function App() {
  const [messages, setMessages] = useState([]);
  const [chatInfo, setChatInfo] = useState(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Parse WhatsApp exported lines
  const parseChat = (text) => {
    const lines = text.split("\n");
    const parsed = lines
      .map((line) => {
        const match = line.match(
          /^(\d{2}\/\d{2}\/\d{2}),\s(.+?)\s-\s([^:]+):\s(.+)$/
        );
        if (match) {
          const [day, month, year] = match[1].split("/");
          return {
            date: match[1], // dd/mm/yy
            time: match[2],
            name: match[3],
            message: match[4],
            dateObj: new Date(`20${year}-${month}-${day}`), // normalized Date
          };
        }
        return null;
      })
      .filter(Boolean);

    setMessages(parsed);

    if (parsed.length > 0) {
      const names = [...new Set(parsed.map((m) => m.name))];
      setChatInfo({
        participants: names,
        totalMessages: parsed.length,
        startDate: parsed[0].date,
        endDate: parsed[parsed.length - 1].date,
      });
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => parseChat(event.target.result);
    reader.readAsText(file);
  };

  // Apply filters (search + date range)
  const filteredMessages = useMemo(() => {
    let result = messages;

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
  }, [messages, search, dateFrom, dateTo]);

  const resetFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

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
            {chatInfo.totalMessages}
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
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-4 mt-4 overflow-y-auto h-[70vh] border relative">
        {filteredMessages.length === 0 ? (
          <p className="text-gray-500 text-center">No messages found</p>
        ) : (
          filteredMessages.map((msg, index) => {
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
                  <div className="flex justify-end items-center gap-1 ">

                 
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
                  </p> </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default App;
