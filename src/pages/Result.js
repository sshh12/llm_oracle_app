import React, { useEffect, useCallback, useRef } from 'react';
import {
  Text,
  Link,
  VStack,
  Stack,
  Slider,
  Button,
  SliderMark,
  SliderTrack,
  Spinner,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from '@chakra-ui/react';
import {
  FacebookShareButton,
  FacebookIcon,
  RedditShareButton,
  RedditIcon,
  LinkedinShareButton,
  LinkedinIcon,
  TwitterShareButton,
  TwitterIcon,
} from 'react-share';
import { Alert, AlertIcon, AlertDescription } from '@chakra-ui/react';
import { SliderThumb } from '@chakra-ui/react';
import { ExternalLinkIcon, PlusSquareIcon, ChatIcon } from '@chakra-ui/icons';
import { useLocalStorage, usePollingGet, STRIPE_LINK } from '../lib/api';

function probabilityFormat(p) {
  if (p < 0.1) {
    return ['Very Unlikely', 'red.900'];
  } else if (p < 0.3) {
    return ['Unlikely', 'red.600'];
  } else if (p < 0.45) {
    return ['Somewhat Unlikely', 'orange.500'];
  } else if (p < 0.55) {
    return ['Even Odds', 'yellow.500'];
  } else if (p < 0.7) {
    return ['Somewhat Likely', 'green.600'];
  } else if (p < 0.9) {
    return ['Likely', 'green.800'];
  } else {
    return ['Very Likely', 'green.900'];
  }
}

function Result({ userId }) {
  const jobId = window.location.pathname.split('/').at(-1);
  const [jobState, updateJobState] = usePollingGet(`/get-job?jobId=${jobId}`);
  const polls = useRef(0);
  useEffect(() => {
    const pollInterval = setInterval(() => {
      updateJobState().then(resp => {
        if (
          resp.state === 'ERROR' ||
          resp.state === 'COMPLETE' ||
          polls.current > 400
        ) {
          clearInterval(pollInterval);
        }
        polls.current += 1;
      });
    }, 10000);
    return () => {
      clearInterval(pollInterval);
    };
  }, [jobId, updateJobState]);

  const [recentResults, setResultResults] = useLocalStorage(
    'oracle:recent',
    () => []
  );
  const addRecent = useCallback(
    job => {
      setResultResults([
        ...recentResults.filter(item => item.id !== job.id),
        {
          id: job.id,
          question: job.question,
        },
      ]);
    },
    [recentResults, setResultResults]
  );
  useEffect(() => {
    if (jobState && recentResults !== null) {
      addRecent(jobState);
    }
  }, [jobState, addRecent, recentResults]);

  return (
    <VStack spacing={10}>
      <Text fontSize={'3rem'}>{jobState?.question}</Text>
      {jobState?.state === 'COMPLETE' && jobState?.resultProbability && (
        <Text
          fontSize={'3rem'}
          color={probabilityFormat(jobState.resultProbability / 100)[1]}
        >
          <b>{probabilityFormat(jobState.resultProbability / 100)[0]}</b>
        </Text>
      )}
      {(jobState === null || jobState.state === 'PENDING') && (
        <VStack spacing={7}>
          <Text>Waiting to start... (~ 1 min)</Text>
          <Spinner size="xl" />
        </VStack>
      )}
      {jobState?.state === 'RUNNING' && (
        <VStack spacing={7}>
          <Text>Running (~ 5 mins, try refreshing if it takes longer)</Text>
          <Spinner size="xl" />
          {jobState.logs.length > 0 && (
            <Alert status="info" w={'70vw'} maxW={'800px'}>
              <AlertIcon />
              <AlertDescription>{jobState.logs.at(-1)}</AlertDescription>
            </Alert>
          )}
        </VStack>
      )}
      {jobState?.state === 'ERROR' && (
        <Alert status="error" w={'70vw'} maxW={'800px'}>
          <AlertIcon />
          <AlertDescription>{jobState.errorMessage}</AlertDescription>
        </Alert>
      )}
      <FixedLikelihoodSlider
        p={jobState?.state === 'COMPLETE' ? jobState?.resultProbability : null}
      />
      <Stack spacing={4} paddingTop="40px">
        <Button href="" rightIcon={<PlusSquareIcon />} variant="outline">
          <Link href="/">Make another prediction</Link>
        </Button>
        {userId && (
          <Button rightIcon={<ExternalLinkIcon />} variant="outline">
            <Link
              href={`${STRIPE_LINK}?client_reference_id=oracle___${userId.replace(
                ':',
                '_'
              )}`}
              isExternal
            >
              Buy more predictions
            </Link>
          </Button>
        )}
        <AnalysisModalButton job={jobState} />
        <ShareModalButton job={jobState} />
      </Stack>
    </VStack>
  );
}

function FixedLikelihoodSlider({ p }) {
  const labelStyles = {
    mt: '2',
    ml: '-2.5',
    fontSize: 'sm',
  };
  const color = p == null ? 'gray.50' : probabilityFormat(p / 100)[1];
  return (
    <Slider value={p} defaultValue={p}>
      <SliderMark value={25} {...labelStyles}>
        25%
      </SliderMark>
      <SliderMark value={50} {...labelStyles}>
        50%
      </SliderMark>
      <SliderMark value={75} {...labelStyles}>
        75%
      </SliderMark>
      {/* {p !== null && (
        <SliderMark value={p} textAlign="center" mt="-10" ml="-5" w="12">
          {p}%
        </SliderMark>
      )} */}
      <SliderTrack bg={color}></SliderTrack>
      {p !== null && <SliderThumb />}
    </Slider>
  );
}

function AnalysisModalButton({ job }) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <Button
        onClick={() => {
          onOpen();
          window.gtag('event', 'opened_analysis');
        }}
        rightIcon={<ChatIcon />}
        variant="outline"
      >
        View analysis
      </Button>

      <Modal onClose={onClose} isOpen={isOpen} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{job?.question}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack>
              {job?.error_message && <Text>{job.error_message}</Text>}
              {(job?.logs || []).map(log => (
                <Text key={log}>{log}</Text>
              ))}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

function ShareModalButton({ job }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const shareURL = `https://oracle.sshh.io/results/${job?.id}`;

  return (
    <>
      <Button
        onClick={() => {
          onOpen();
          window.gtag('event', 'opened_share');
        }}
        rightIcon={<ExternalLinkIcon />}
        colorScheme="teal"
        variant="solid"
      >
        Share prediction
      </Button>

      <Modal onClose={onClose} isOpen={isOpen} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Share</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack direction="row">
              <TwitterShareButton url={shareURL}>
                <TwitterIcon size={32} round />
              </TwitterShareButton>
              <RedditShareButton url={shareURL}>
                <RedditIcon size={32} round />
              </RedditShareButton>
              <FacebookShareButton url={shareURL}>
                <FacebookIcon size={32} round />
              </FacebookShareButton>
              <LinkedinShareButton url={shareURL}>
                <LinkedinIcon size={32} round />
              </LinkedinShareButton>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default Result;
