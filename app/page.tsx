import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { ContaminationLattice } from "@/components/lattice";
import { EvidenceSection } from "@/components/evidence-section";
import { CheckPanel, Footer, HowItWorks } from "@/components/sections";
import { ResultsSection } from "@/components/results-section";
import { Faq } from "@/components/faq";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ContaminationLattice />
        <HowItWorks />
        <EvidenceSection />
        <ResultsSection />
        <Faq />
        <CheckPanel />
      </main>
      <Footer />
    </>
  );
}
