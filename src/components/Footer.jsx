import { FaGithub, FaLinkedin, FaEnvelope } from "react-icons/fa";

function Footer() {
  return (
    <footer className="w-full bg-gray-900 text-gray-300 py-6 mt-6">
      <div className="max-w-4xl mx-auto text-center space-y-3">
        <p className="text-sm">
          Built by <span className="font-semibold text-white">Ayush Solanki</span>
        </p>
        <div className="flex justify-center gap-6">
          <a
            href="mailto:ayush@example.com"
            className="hover:text-white transition"
          >
            <FaEnvelope size={20} />
          </a>
          <a
            href="https://github.com/ayush"
            target="_blank"
            className="hover:text-white transition"
          >
            <FaGithub size={20} />
          </a>
          <a
            href="https://linkedin.com/in/ayush"
            target="_blank"
            className="hover:text-white transition"
          >
            <FaLinkedin size={20} />
          </a>
        </div>
        <p className="text-xs text-gray-500">
          © {new Date().getFullYear()} Ayush Solanki. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
export default Footer;
