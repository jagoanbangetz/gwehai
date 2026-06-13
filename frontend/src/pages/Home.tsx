import Header from '../components/Header'
import Hero from '../components/Hero'
import Stats from '../components/Stats'
import Features from '../components/Features'
import FAQ from '../components/FAQ'
import Footer from '../components/Footer'
import ScrollToTop from '../components/ScrollToTop'
import AnimatedBackground from '../components/AnimatedBackground'
import '../pages/Landing.css'

const Home = () => {
  return (
    <>
      <AnimatedBackground variant="full" intensity="low" />
      <Header />
      <Hero />
      <Stats />
      <Features />
      <FAQ />
      <Footer />
      <ScrollToTop />
    </>
  )
}

export default Home
