"use client";

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { INTRO_ASSETS } from "@/lib/login-brand-colors";
import styles from "./intro.module.css";

export function MobyIntroSplash() {
  const [visible, setVisible] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const blueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const logo = logoRef.current;
    const cover = coverRef.current;
    const blue = blueRef.current;
    if (!(section && logo && cover && blue)) {
      return;
    }

    gsap.set(logo, { opacity: 0, y: 0 });
    gsap.set(cover, { opacity: 0 });
    gsap.set(blue, { top: "100%" });

    const tl = gsap.timeline({
      onComplete: () => setVisible(false),
    });

    tl.to(logo, { delay: 0, duration: 1, opacity: 1 })
      .to(cover, { delay: -0.8, duration: 1.5, ease: "power3.out", opacity: 1 })
      .to(logo, {
        delay: -0.5,
        duration: 1.5,
        ease: "power3.out",
        opacity: 0,
        y: -120,
      })
      .to(blue, { delay: -1.8, duration: 0.7, ease: "power4.in", top: 0 })
      .to(section, {
        delay: -1.7,
        duration: 0.8,
        ease: "power2.in",
        height: 0,
      });

    return () => {
      tl.kill();
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div aria-hidden="true" className={styles.introSection} ref={sectionRef}>
      <div className={styles.logo} ref={logoRef}>
        <img
          alt=""
          className="h-auto w-full"
          height={25}
          src={INTRO_ASSETS.logo}
          width={174}
        />
      </div>
      <div className={styles.bgBlue} ref={blueRef} />
      <div className={styles.bgCover} ref={coverRef} />
    </div>
  );
}
