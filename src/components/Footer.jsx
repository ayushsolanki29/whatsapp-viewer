// src/components/Footer.jsx
import { FaEnvelope, FaPhoneAlt, FaLinkedin, FaGithub } from "react-icons/fa";

export default function Footer() {
  return (
    <footer className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white mt-6 rounded-t-2xl shadow-lg">
      <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Signature */}
        <p className="text-lg font-semibold text-center md:text-left">
          👋 I’m <span className="font-bold"><a href="https://ayushsolanki.site"> Ayush Solanki</a></span>
        </p>

        {/* Contact Links */}
        <div className="flex gap-6 text-xl">
     
    
        
          <a
            href="https://github.com/ayushsolanki29"
            target="_blank"
            rel="noreferrer"
            className="hover:text-yellow-300 transition"
          >
            <FaGithub />
          </a>
        </div>
      </div>

      {/* Bottom note */}
      <div className="text-center text-sm py-2 bg-blue-700/70">
        © {new Date().getFullYear()} Ayush Solanki. All rights reserved.
      </div>
    </footer>
  );
}
