import { createRoot } from "react-dom/client";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/600-italic.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./styles.css";
import Root from "./ui/Home.tsx";
import Gallery from "./ui/Gallery.tsx";

createRoot(document.getElementById("root")!).render(location.hash === "#cards" ? <Gallery /> : <Root />);
