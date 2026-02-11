import Header from '../components/Header'
import Hero from '../components/Hero'
import Features from '../components/Features'
import FAQ from '../components/FAQ'
import Footer from '../components/Footer'
import ScrollToTop from '../components/ScrollToTop'
import AnimatedBackground from '../components/AnimatedBackground'
import PageLoader from '../components/PageLoader'

const Home = () => {
  return (
    <PageLoader>
    <>
      <AnimatedBackground variant="full" intensity="medium" />
      <Header />
      <Hero />
      <Features />
      <FAQ />
      <Footer />
      <ScrollToTop />
    </>
    </PageLoader>
  )
}

export default Home
